import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const sb = supabase as any;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function monthsBack(n: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

type Note = { text: string; tone: "good" | "bad" | "neutral" };

/**
 * Plain-language coaching notes for one agent: how this month compares with
 * their own trailing three months and with the team median.
 */
export function CoachingInsights({ employeeId, month }: { employeeId: string; month: string }) {
  const window = useMemo(() => monthsBack(4), []);
  const since = `${window[window.length - 1]}-01`;

  const q = useQuery({
    queryKey: ["coaching", employeeId, since],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [revenue, activations] = await Promise.all([
        fetchAll(() => sb.from("revenue").select("date,amount,employee_id,employee_id_2,customer_name").gte("date", since)),
        fetchAll(() =>
          sb
            .from("daily_lead_activations")
            .select("id,activation_date,qualified_at,employee_id,conversion_employee_id,answered")
            .eq("legacy", false)
            .gte("activation_date", since),
        ),
      ]);
      return { revenue, activations };
    },
  });

  const notes = useMemo<Note[]>(() => {
    if (!q.data) return [];
    const rev = (q.data.revenue ?? []) as any[];
    const acts = (q.data.activations ?? []) as any[];

    const perMonth = (id: string, m: string) => {
      const mine = acts.filter(
        (a) => (a.employee_id === id || a.conversion_employee_id === id) && (a.activation_date ?? "").startsWith(m),
      );
      const deposits = rev.filter((r) => (r.employee_id === id || r.employee_id_2 === id) && r.date.startsWith(m));
      const clients = new Set(mine.map((a: any) => a.id));
      // STD = a client with two or more deposits inside the month.
      const counts = new Map<string, number>();
      for (const d of deposits) {
        const k = (d.customer_name ?? "").trim().toLowerCase();
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const stds = [...counts.values()].filter((c) => c >= 2).length;
      const amount = deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
      return {
        ftds: mine.length,
        answered: mine.filter((a: any) => a.answered).length,
        clients: clients.size,
        stds,
        amount,
        avgDeposit: deposits.length ? amount / deposits.length : 0,
      };
    };

    const current = perMonth(employeeId, month);
    const priorMonths = window.filter((m) => m !== month).slice(0, 3);
    const prior = priorMonths.map((m) => perMonth(employeeId, m));
    const avg = (pick: (x: ReturnType<typeof perMonth>) => number) =>
      prior.length ? prior.reduce((s, p) => s + pick(p), 0) / prior.length : 0;

    // Team median for the same month.
    const peers = [...new Set(acts.flatMap((a) => [a.employee_id, a.conversion_employee_id]).filter(Boolean))] as string[];
    const peerStats = peers.map((id) => perMonth(id, month));
    const medianOf = (pick: (x: ReturnType<typeof perMonth>) => number) => {
      const xs = peerStats.map(pick).sort((a, b) => a - b);
      if (!xs.length) return 0;
      const mid = Math.floor(xs.length / 2);
      return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
    };

    const out: Note[] = [];
    const pctChange = (now: number, before: number) => (before ? ((now - before) / before) * 100 : null);

    const ftdChange = pctChange(current.ftds, avg((p) => p.ftds));
    if (ftdChange != null && Math.abs(ftdChange) >= 15) {
      out.push({
        tone: ftdChange > 0 ? "good" : "bad",
        text: `FTDs ${ftdChange > 0 ? "up" : "down"} ${Math.abs(ftdChange).toFixed(0)}% this month (${current.ftds} vs. a ${avg((p) => p.ftds).toFixed(1)} monthly average).`,
      });
    }

    const stdRateNow = current.clients ? (current.stds / current.clients) * 100 : 0;
    const stdRateBefore = prior.length
      ? (prior.reduce((s, p) => s + (p.clients ? p.stds / p.clients : 0), 0) / prior.length) * 100
      : 0;
    if (current.clients >= 3 && Math.abs(stdRateNow - stdRateBefore) >= 8) {
      out.push({
        tone: stdRateNow >= stdRateBefore ? "good" : "bad",
        text: `Second-deposit rate ${stdRateNow >= stdRateBefore ? "improved" : "dropped"} from ${stdRateBefore.toFixed(0)}% to ${stdRateNow.toFixed(0)}%.`,
      });
    }

    const medDeposit = medianOf((p) => p.avgDeposit);
    if (current.avgDeposit > 0 && medDeposit > 0) {
      const diff = ((current.avgDeposit - medDeposit) / medDeposit) * 100;
      if (Math.abs(diff) >= 15) {
        out.push({
          tone: diff > 0 ? "good" : "neutral",
          text: `Average deposit ${fmtMoney(current.avgDeposit)} is ${Math.abs(diff).toFixed(0)}% ${diff > 0 ? "above" : "below"} the team median of ${fmtMoney(medDeposit)}.`,
        });
      }
    }

    if (current.ftds >= 3) {
      const answerRate = (current.answered / current.ftds) * 100;
      if (answerRate < 60) {
        out.push({
          tone: "bad",
          text: `Only ${answerRate.toFixed(0)}% of this month's clients are marked answered — chase the unanswered ones before they go cold.`,
        });
      } else if (answerRate >= 90) {
        out.push({ tone: "good", text: `${answerRate.toFixed(0)}% of clients answered — best-in-class contact discipline.` });
      }
    }

    const revChange = pctChange(current.amount, avg((p) => p.amount));
    if (revChange != null && Math.abs(revChange) >= 20) {
      out.push({
        tone: revChange > 0 ? "good" : "bad",
        text: `Attributed deposits ${revChange > 0 ? "up" : "down"} ${Math.abs(revChange).toFixed(0)}% on their own 3-month average (${fmtMoney(current.amount)}).`,
      });
    }

    if (!out.length) {
      out.push({ tone: "neutral", text: "Performance is steady — no meaningful change against their own recent months or the team median." });
    }
    return out;
  }, [q.data, employeeId, month, window]);

  if (q.isLoading) return null;

  return (
    <div className="card-surface mb-6 p-5">
      <h3 className="font-display text-base font-semibold flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-amber-500" /> Coaching notes
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {month} against this agent's own last 3 months and the team median.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {notes.map((n, i) => (
          <li key={i} className="flex gap-2">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                n.tone === "good" && "bg-emerald-500",
                n.tone === "bad" && "bg-rose-500",
                n.tone === "neutral" && "bg-muted-foreground",
              )}
            />
            <span>{n.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
