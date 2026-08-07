import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { EmployeeLink } from "@/components/employee-link";
import { AnsweredBadge, PotentialBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, fmtMoney } from "@/lib/format";
import { qualifiesAsFtd, ftdPendingReasons } from "@/lib/rules";
import { useCompanySettings } from "@/lib/settings";

type ActRow = {
  id: string;
  employee_id: string;
  conversion_employee_id: string | null;
  lead_name: string | null;
  balance: number;
  potential: "low" | "mid" | "high" | null;
  answered: boolean;
  activation_date: string | null;
  qualified_at?: string | null;
  daily_lead_entries?: { entry_date: string } | null;
};

type PendingRow = { row: ActRow; balance: number; reasons: string[]; agent: string };

const actDate = (r: ActRow) => r.activation_date ?? r.daily_lead_entries?.entry_date ?? null;

/**
 * Conversion agent leaderboard for a date range: qualified FTDs vs pending ones.
 * Lives on the Leads page (conversion side of the business).
 */
export function ConversionsByAgent({ start, end }: { start: Date; end: Date }) {
  const settings = useCompanySettings();
  const navigate = useNavigate();
  const [pendingView, setPendingView] = useState<{ title: string; rows: PendingRow[] } | null>(null);

  const activationsQ = useQuery({
    queryKey: ["activated-leads"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("daily_lead_activations")
        .select("*, daily_lead_entries(entry_date, source_id, lead_sources(name))")
        .order("created_at", { ascending: false }));
      return (data ?? []) as unknown as ActRow[];
    },
  });

  const revenueQ = useQuery({
    queryKey: ["revenue-for-activations"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("revenue")
        .select("id, activation_id, customer_name, amount, date, notes, employee_id, affiliate_id")
        .order("date", { ascending: false }));
      return (data ?? []) as { customer_name: string | null; amount: number }[];
    },
  });

  const employeesQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean; team?: string | null }[];
    },
  });

  const employeeName = (id?: string | null) =>
    (employeesQ.data ?? []).find((e) => e.id === id)?.name ?? "—";

  // Prefer the direct client link; name matching only covers legacy rows.
  const deposits = useMemo(() => depositIndex((revenueQ.data ?? []) as any[]), [revenueQ.data]);

  const rows = useMemo(() => {
    const s = start.getTime();
    const e = end.getTime();
    return (activationsQ.data ?? []).filter((r) => {
      const d = actDate(r);
      if (!d) return true;
      const t = new Date(d + "T00:00:00").getTime();
      return t >= s && t <= e;
    });
  }, [activationsQ.data, start, end]);

  const byAgent = useMemo(() => {
    const m = new Map<string, { count: number; pending: number; pendingRows: PendingRow[] }>();
    for (const r of rows) {
      const id = r.conversion_employee_id;
      if (!id) continue;
      const e = m.get(id) ?? { count: 0, pending: 0, pendingRows: [] };
      const bal = effectiveBalanceIndexed(r as any, deposits);

      if (qualifiesAsFtd(r as any, bal, settings)) e.count += 1;
      else {
        e.pending += 1;
        e.pendingRows.push({
          row: r,
          balance: bal,
          reasons: ftdPendingReasons(r as any, bal, settings),
          agent: employeeName(id),
        });
      }
      m.set(id, e);
    }
    return [...m.entries()]
      .map(([id, v]) => ({ id, name: employeeName(id), ...v, total: v.count + v.pending }))
      .sort((a, b) => b.count - a.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, employeesQ.data, depositsByName, settings]);

  const totals = useMemo(
    () => ({
      count: byAgent.reduce((s, a) => s + a.count, 0),
      pending: byAgent.reduce((s, a) => s + a.pending, 0),
      total: byAgent.reduce((s, a) => s + a.total, 0),
      pendingRows: byAgent.flatMap((a) => a.pendingRows),
    }),
    [byAgent],
  );

  return (
    <>
      <div className="mb-6 rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Conversions by agent</h2>
          <p className="text-xs text-muted-foreground">{`Counts qualified FTDs: answered and (mid/high potential or balance of $${settings.ftdBalanceThreshold}+). Everything else is pending.`}</p>
        </div>
        {byAgent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No conversions in this range.</p>
        ) : (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 px-4 font-medium">Conversion agent</th>
                  <th className="py-2 px-4 font-medium">Conversions</th>
                  <th className="py-2 px-4 font-medium">Pending</th>
                  <th className="py-2 px-4 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((a) => (
                  <tr key={a.id} className="border-t border-border/50">
                    <td className="py-2 px-4"><EmployeeLink id={a.id} name={a.name} /></td>
                    <td className="py-2 px-4 font-medium num">{a.count}</td>
                    <td className="py-2 px-4 num text-muted-foreground">
                      {a.pending > 0 ? (
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-foreground"
                          onClick={() => setPendingView({ title: `Pending FTDs — ${a.name}`, rows: a.pendingRows })}
                        >
                          {a.pending}
                        </button>
                      ) : (
                        a.pending
                      )}
                    </td>
                    <td className="py-2 px-4 num">{a.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="py-2 px-4">Total</td>
                  <td className="py-2 px-4 num">{totals.count}</td>
                  <td className="py-2 px-4 num text-muted-foreground">
                    {totals.pending > 0 ? (
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={() => setPendingView({ title: "All pending FTDs", rows: totals.pendingRows })}
                      >
                        {totals.pending}
                      </button>
                    ) : (
                      totals.pending
                    )}
                  </td>
                  <td className="py-2 px-4 num">{totals.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!pendingView} onOpenChange={(o) => { if (!o) setPendingView(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{pendingView?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto scroll-slim">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 px-3 font-medium">Client</th>
                  <th className="py-2 px-3 font-medium">Agent</th>
                  <th className="py-2 px-3 font-medium">Activation date</th>
                  <th className="py-2 px-3 font-medium">Balance</th>
                  <th className="py-2 px-3 font-medium">Potential</th>
                  <th className="py-2 px-3 font-medium">Answered</th>
                  <th className="py-2 px-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {(pendingView?.rows ?? []).map((p) => (
                  <tr
                    key={p.row.id}
                    className="border-t border-border/50 cursor-pointer hover:bg-muted/30"
                    onClick={() => {
                      setPendingView(null);
                      navigate({ to: "/activations", search: { client: p.row.id } as any });
                    }}
                  >
                    <td className="py-2 px-3">{p.row.lead_name || "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">{p.agent}</td>
                    <td className="py-2 px-3">{actDate(p.row) ? fmtDate(actDate(p.row)!) : "—"}</td>
                    <td className="py-2 px-3 num">{fmtMoney(p.balance)}</td>
                    <td className="py-2 px-3">
                      {p.row.potential ? <PotentialBadge potential={p.row.potential} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-3"><AnsweredBadge answered={p.row.answered} /></td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{p.reasons.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
