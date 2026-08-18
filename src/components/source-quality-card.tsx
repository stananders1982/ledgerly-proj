import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { computeSourceQuality, type SourceQualityInput } from "@/lib/source-quality";

const sb = supabase as any;

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const shift = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return iso(d);
};

/**
 * Ranks sources on the quality of the money they bring rather than raw volume:
 * deposit per lead, repeat-deposit rate, speed to activation, and how much of
 * the money leaves again.
 */
export function SourceQualityCard({ windowDays = 90 }: { windowDays?: number }) {
  const start = useMemo(() => shift(windowDays), [windowDays]);
  const prevStart = useMemo(() => shift(windowDays * 2), [windowDays]);

  const q = useQuery({
    queryKey: ["source-quality", start],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [leads, activations, revenue, withdrawals, sources] = await Promise.all([
        fetchAll(() => sb.from("daily_lead_entries").select("id,source_id,entry_date,received,activated,cost").gte("entry_date", prevStart)),
        fetchAll(() =>
          sb
            .from("daily_lead_activations")
            .select("lead_name,activation_date,created_at,qualified_at,entry_id,daily_lead_entries(entry_date,source_id)")
            .eq("legacy", false)
            .gte("activation_date", prevStart),
        ),
        fetchAll(() => sb.from("revenue").select("amount,date,customer_name").gte("date", prevStart)),
        fetchAll(() => sb.from("withdrawals").select("amount,customer_name").gte("date", prevStart)),
        fetchAll(() => sb.from("lead_sources").select("id,name")),
      ]);
      return { leads, activations, revenue, withdrawals, sources };
    },
  });

  const rows = useMemo(() => {
    if (!q.data) return [];
    const sources = ((q.data.sources ?? []) as any[]).map((s) => ({ id: s.id, name: s.name }));

    const acts = ((q.data.activations ?? []) as any[]).map((a) => ({
      lead_name: a.lead_name,
      activation_date: a.activation_date,
      created_at: a.created_at,
      qualified_at: a.qualified_at,
      source_id: a.daily_lead_entries?.source_id ?? null,
      entry_date: a.daily_lead_entries?.entry_date ?? null,
    }));

    const build = (from: string, to: string): SourceQualityInput => ({
      sources,
      leads: ((q.data!.leads ?? []) as any[])
        .filter((l) => l.entry_date >= from && l.entry_date < to)
        .map((l) => ({
          source_id: l.source_id,
          entry_date: l.entry_date,
          received: Number(l.received || 0),
          activated: Number(l.activated || 0),
          cost: Number(l.cost || 0),
        })),
      activations: acts.filter((a) => {
        const d = a.activation_date ?? a.created_at.slice(0, 10);
        return d >= from && d < to;
      }),
      revenue: ((q.data!.revenue ?? []) as any[])
        .filter((r) => r.date >= from && r.date < to)
        .map((r) => ({ amount: Number(r.amount || 0), date: r.date, customer_name: r.customer_name })),
      withdrawals: ((q.data!.withdrawals ?? []) as any[]).map((w) => ({
        amount: Number(w.amount || 0),
        customer_name: w.customer_name,
      })),
    });

    const today = iso(new Date());
    return computeSourceQuality(build(start, "9999-12-31"), build(prevStart, start)).slice(0, 8).map((r) => ({
      ...r,
      _today: today,
    }));
  }, [q.data, start, prevStart]);

  return (
    <div className="card-surface overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" /> Source quality
        </h3>
        <p className="text-xs text-muted-foreground">
          Last {windowDays} days — scored on deposit per lead, repeat deposits, speed and money retained.
        </p>
      </div>

      {q.isLoading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Scoring sources…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Not enough activity in this window to score sources yet.
        </p>
      ) : (
        <div className="overflow-x-auto scroll-slim">
          <table className="w-full text-sm">
            <thead className="table-head bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Clients</th>
                <th className="px-4 py-3">Deposit / lead</th>
                <th className="px-4 py-3">STD rate</th>
                <th className="px-4 py-3">Days to activate</th>
                <th className="px-4 py-3">Leak</th>
                <th className="px-4 py-3">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "num rounded px-1.5 py-0.5 text-xs font-semibold",
                          r.score >= 70 && "bg-emerald-500/15 text-emerald-600",
                          r.score >= 40 && r.score < 70 && "bg-amber-500/15 text-amber-600",
                          r.score < 40 && "bg-rose-500/15 text-rose-600",
                        )}
                      >
                        {r.score}
                      </span>
                      {r.trend != null && Math.abs(r.trend) >= 1 && (
                        <span
                          className={cn(
                            "flex items-center gap-0.5 text-[11px]",
                            r.trend > 0 ? "text-emerald-600" : "text-rose-600",
                          )}
                        >
                          {r.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {Math.abs(Math.round(r.trend))}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="num px-4 py-2.5">{r.received}</td>
                  <td className="num px-4 py-2.5">{r.qualified || r.activated}</td>
                  <td className="num px-4 py-2.5">{fmtMoney(r.depositPerLead)}</td>
                  <td className="num px-4 py-2.5">{r.stdRate.toFixed(0)}%</td>
                  <td className="num px-4 py-2.5">{r.timeToActivation ?? "—"}</td>
                  <td className="num px-4 py-2.5 text-muted-foreground">{r.leakRate.toFixed(0)}%</td>
                  <td className={cn("num px-4 py-2.5 font-medium", r.netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {fmtMoney(r.netProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
