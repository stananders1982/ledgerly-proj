import { useMemo } from "react";
import { toBase, toDisplay } from "@/lib/fx";
import { getDisplayCurrency } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { EmployeeLink } from "@/components/employee-link";
import { fmtMoney, useDisplayCurrency } from "@/lib/format";
import { normalizeTeam } from "@/lib/rules";
import { cn } from "@/lib/utils";

type SplitRow = {
  amount: number | string | null;
  employee_id: string | null;
  employee_id_2: string | null;
  split_pct: number | string | null;
};

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Split-adjusted per-agent totals: agent 1 gets split_pct, agent 2 the rest. */
function accumulate(rows: SplitRow[], into: Map<string, number>) {
  for (const r of rows) {
    const total = toDisplay(r.amount, (r as any).currency);
    const pct = Number(r.split_pct ?? 100) / 100;
    if (r.employee_id) {
      into.set(r.employee_id, (into.get(r.employee_id) ?? 0) + total * (r.employee_id_2 ? pct : 1));
    }
    if (r.employee_id_2) {
      into.set(r.employee_id_2, (into.get(r.employee_id_2) ?? 0) + total * (1 - pct));
    }
  }
}

/**
 * Retention scoreboard: deposits, withdrawals and the net per Team R agent
 * for the selected period. Managers and conversion agents are excluded.
 */
export function RetentionScoreboard({ start, end }: { start: Date; end: Date }) {
  const startIso = iso(start);
  const endIso = iso(end);

  const revQ = useQuery({
    queryKey: ["retention-board-rev", startIso, endIso],
    queryFn: async () =>
      (await fetchAll(() =>
        supabase
          .from("revenue")
          .select("amount,currency,employee_id,employee_id_2,split_pct")
          .gte("date", startIso)
          .lte("date", endIso),
      )) as unknown as SplitRow[],
  });

  const wdQ = useQuery({
    queryKey: ["retention-board-wd", startIso, endIso],
    queryFn: async () =>
      (await fetchAll(() =>
        supabase
          .from("withdrawals")
          .select("amount,currency,employee_id,employee_id_2,split_pct")
          .gte("date", startIso)
          .lte("date", endIso),
      )) as unknown as SplitRow[],
  });

  const empQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean; team?: string | null }[];
    },
  });

  const displayCurrency = useDisplayCurrency();
  const rows = useMemo(() => {
    const deposits = new Map<string, number>();
    const withdrawals = new Map<string, number>();
    accumulate(revQ.data ?? [], deposits);
    accumulate(wdQ.data ?? [], withdrawals);

    return (empQ.data ?? [])
      .filter((e) => normalizeTeam(e.team) === "R")
      .map((e) => {
        const dep = deposits.get(e.id) ?? 0;
        const wd = withdrawals.get(e.id) ?? 0;
        return { id: e.id, name: e.name, deposits: dep, withdrawals: wd, total: dep - wd };
      })
      .filter((r) => r.deposits !== 0 || r.withdrawals !== 0)
      .sort((a, b) => b.total - a.total);
  }, [revQ.data, wdQ.data, empQ.data, displayCurrency]);

  const totals = useMemo(
    () => ({
      deposits: rows.reduce((s, r) => s + r.deposits, 0),
      withdrawals: rows.reduce((s, r) => s + r.withdrawals, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
    }),
    [rows],
  );

  return (
    <div className="glass-surface glass-hover min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="font-display text-base font-semibold">Retention agents</h3>
        <p className="text-xs text-muted-foreground">Deposits minus withdrawals, split-adjusted.</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No retention activity in this range.</p>
      ) : (
        <div className="overflow-x-auto scroll-slim">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Agent</th>
                <th className="py-2 px-3 font-medium text-right">Deposits</th>
                <th className="py-2 px-3 font-medium text-right">Withdrawals</th>
                <th className="py-2 pl-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/50">
                  <td className="py-2 pr-3"><EmployeeLink id={r.id} name={r.name} /></td>
                  <td className="py-2 px-3 num text-right text-emerald-500">{fmtMoney(r.deposits)}</td>
                  <td className="py-2 px-3 num text-right text-rose-500">{fmtMoney(r.withdrawals)}</td>
                  <td className={cn("py-2 pl-3 num text-right font-semibold", r.total >= 0 ? "text-emerald-500" : "text-rose-500")}>
                    {fmtMoney(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 px-3 num text-right">{fmtMoney(totals.deposits)}</td>
                <td className="py-2 px-3 num text-right">{fmtMoney(totals.withdrawals)}</td>
                <td className={cn("py-2 pl-3 num text-right", totals.total >= 0 ? "text-emerald-500" : "text-rose-500")}>
                  {fmtMoney(totals.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
