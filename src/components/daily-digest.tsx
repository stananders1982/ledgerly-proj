import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sunrise } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtMoney, getDisplayCurrency } from "@/lib/format";
import { toDisplay } from "@/lib/fx";
import { cn } from "@/lib/utils";

const sb = supabase as any;

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const shift = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

/**
 * "Since yesterday" digest — the handful of numbers you would otherwise open
 * five pages to check. Compares the last 24h against the previous day.
 */
export function DailyDigest() {
  const today = iso(new Date());
  const yesterday = shift(-1);
  const dayBefore = shift(-2);

  const q = useQuery({
    queryKey: ["daily-digest", today],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [revenue, withdrawals, expenses, activations] = await Promise.all([
        fetchAll(() => sb.from("revenue").select("date,amount,currency,customer_name,employee_id").gte("date", dayBefore)),
        fetchAll(() => sb.from("withdrawals").select("date,amount,currency").gte("date", dayBefore)),
        fetchAll(() => sb.from("expenses").select("date,amount,currency").gte("date", dayBefore)),
        fetchAll(() =>
          sb
            .from("daily_lead_activations")
            .select("activation_date,qualified_at,lead_name,employee_id,conversion_employee_id")
            .eq("legacy", false)
            .gte("activation_date", dayBefore),
        ),
        ]);
      const employees = (await sb.rpc("list_employees_directory")).data ?? [];
      return { revenue, withdrawals, expenses, activations, employees };
    },
  });

  const d = useMemo(() => {
    const rev = (q.data?.revenue ?? []) as any[];
    const wds = (q.data?.withdrawals ?? []) as any[];
    const exps = (q.data?.expenses ?? []) as any[];
    const acts = (q.data?.activations ?? []) as any[];
    const names = new Map<string, string>(((q.data?.employees ?? []) as any[]).map((e) => [e.id, e.name]));

    const baseCcy = getDisplayCurrency();
    const sum = (rows: any[], day: string) =>
      rows.filter((r) => r.date === day).reduce((s, r) => s + toDisplay(r.amount, r.currency), 0);

    const depositsToday = sum(rev, yesterday);
    const depositsPrev = sum(rev, dayBefore);

    const ftds = acts.filter((a) => a.activation_date === yesterday);
    const qualified = acts.filter((a) => a.qualified_at === yesterday);

    // Second deposit from a client that deposited before yesterday.
    const byClient = new Map<string, number>();
    for (const r of rev) {
      const k = (r.customer_name ?? "").trim().toLowerCase();
      if (k) byClient.set(k, (byClient.get(k) ?? 0) + 1);
    }
    const stds = rev.filter((r) => r.date === yesterday && (byClient.get((r.customer_name ?? "").trim().toLowerCase()) ?? 0) > 1).length;

    const perAgent = new Map<string, number>();
    for (const r of rev.filter((x) => x.date === yesterday)) {
      if (!r.employee_id) continue;
      perAgent.set(r.employee_id, (perAgent.get(r.employee_id) ?? 0) + toDisplay(r.amount, r.currency));
    }
    const top = [...perAgent.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      depositsToday,
      change: depositsPrev ? ((depositsToday - depositsPrev) / depositsPrev) * 100 : null,
      ftds: ftds.length,
      qualified: qualified.length,
      stds,
      withdrawals: sum(wds, yesterday),
      expenses: sum(exps, yesterday),
      topAgent: top ? { name: names.get(top[0]) ?? "Agent", amount: top[1] } : null,
      empty: !rev.length && !acts.length && !wds.length && !exps.length,
    };
  }, [q.data, yesterday, dayBefore]);

  return (
    <div className="card-surface p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <Sunrise className="h-4 w-4 text-amber-500" /> Since yesterday
          </h3>
          <p className="text-xs text-muted-foreground">{yesterday}</p>
        </div>
        {d.change != null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              d.change >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600",
            )}
          >
            {d.change >= 0 ? "+" : ""}
            {d.change.toFixed(0)}% deposits
          </span>
        )}
      </div>

      {d.empty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing was logged yesterday.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Cell label="Deposits" value={fmtMoney(d.depositsToday)} to="/revenue" tone="text-emerald-500" />
            <Cell label="New FTDs" value={String(d.ftds)} to="/activations" />
            <Cell label="Became valid" value={String(d.qualified)} to="/activations" />
            <Cell label="STDs" value={String(d.stds)} to="/activations" />
            <Cell label="Withdrawals" value={fmtMoney(d.withdrawals)} to="/withdrawals" tone="text-rose-500" />
            <Cell label="Expenses" value={fmtMoney(d.expenses)} to="/expenses" tone="text-rose-500" />
          </div>
          {d.topAgent && (
            <p className="mt-3 text-xs text-muted-foreground">
              Top agent: <span className="font-medium text-foreground">{d.topAgent.name}</span> with{" "}
              {fmtMoney(d.topAgent.amount)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Cell({ label, value, to, tone }: { label: string; value: string; to: string; tone?: string }) {
  return (
    <Link to={to} className="rounded-lg border border-border p-3 transition hover:bg-accent/40">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-base font-semibold", tone)}>{value}</p>
    </Link>
  );
}
