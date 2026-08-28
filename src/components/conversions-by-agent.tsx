import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { EmployeeLink } from "@/components/employee-link";
import { AnsweredBadge, PotentialBadge, LateFtdBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, fmtMoney } from "@/lib/format";
import { qualifiesAsFtd, ftdPendingReasons, depositIndex, effectiveBalanceIndexed, isAgentTeam, normalizeTeam, isLegacyClient, isLateRetentionFtd, monthsLate } from "@/lib/rules";
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
 * Used on the Leads page and as the conversion scoreboard on the dashboard.
 */
export function ConversionsByAgent({
  start,
  end,
  variant = "panel",
  title = "Conversions by agent",
  teams,
}: {
  start: Date;
  end: Date;
  /** "card" renders the dashboard glass surface instead of the bordered panel. */
  variant?: "panel" | "card";
  title?: string;
  /** Restrict to specific teams (e.g. ["C"]); defaults to all agent teams. */
  teams?: string[];
}) {
  const settings = useCompanySettings();
  const navigate = useNavigate();
  const [pendingView, setPendingView] = useState<{ title: string; rows: PendingRow[] } | null>(null);
  const [lateView, setLateView] = useState<{ title: string; rows: PendingRow[] } | null>(null);


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
        .select("id, activation_id, customer_name, amount, currency, date, notes, employee_id, affiliate_id")
        .order("date", { ascending: false }));
      return (data ?? []) as { customer_name: string | null; amount: number; currency: string | null }[];
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

  /** Managers (Team M) are never ranked as agents; `teams` narrows further. */
  const isAgentId = (id?: string | null) => {
    const e = (employeesQ.data ?? []).find((x) => x.id === id);
    if (!e) return !teams;
    if (teams) return teams.includes(normalizeTeam(e.team));
    return isAgentTeam(e.team);
  };


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
    const m = new Map<string, { count: number; pending: number; late: number; pendingRows: PendingRow[]; lateRows: PendingRow[] }>();
    for (const r of rows) {
      // Legacy (old CRM) clients are never credited to a conversion agent.
      if (isLegacyClient(r as any)) continue;
      const id = r.conversion_employee_id;
      if (!id || !isAgentId(id)) continue;
      const e = m.get(id) ?? { count: 0, pending: 0, late: 0, pendingRows: [], lateRows: [] };
      const bal = effectiveBalanceIndexed(r as any, deposits);

      if (qualifiesAsFtd(r as any, bal, settings)) {
        e.count += 1;
        // Credited to the conversion agent, but only became valid after a
        // retention deposit in a later month.
        if (isLateRetentionFtd(r as any)) {
          e.late += 1;
          e.lateRows.push({ row: r, balance: bal, reasons: [], agent: employeeName(id) });
        }
      }
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
  }, [rows, employeesQ.data, deposits, settings]);

  const totals = useMemo(
    () => ({
      count: byAgent.reduce((s, a) => s + a.count, 0),
      pending: byAgent.reduce((s, a) => s + a.pending, 0),
      total: byAgent.reduce((s, a) => s + a.total, 0),
      late: byAgent.reduce((s, a) => s + a.late, 0),
      pendingRows: byAgent.flatMap((a) => a.pendingRows),
      lateRows: byAgent.flatMap((a) => a.lateRows),
    }),
    [byAgent],
  );

  const card = variant === "card";

  return (
    <>
      <div className={card ? "glass-surface glass-hover min-w-0 overflow-hidden p-4 sm:p-5" : "mb-6 rounded-lg border border-border"}>
        <div className={card ? "mb-3" : "border-b border-border px-4 py-3"}>
          <h2 className={card ? "font-display text-base font-semibold" : "text-sm font-semibold"}>{title}</h2>
          <p className="text-xs text-muted-foreground">{`Counts qualified FTDs: answered and (mid/high potential or balance of $${settings.ftdBalanceThreshold}+). Everything else is pending.`}</p>
        </div>

        {byAgent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No conversions in this range.</p>
        ) : (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead className={card ? "text-left text-[11px] uppercase tracking-wider text-muted-foreground" : "bg-muted/40 text-left text-xs uppercase text-muted-foreground"}>
                <tr>
                  <th className="py-2 px-4 font-medium">{card ? "Agent" : "Conversion agent"}</th>
                  <th className="py-2 px-4 font-medium">{card ? "FTDs" : "Conversions"}</th>
                  <th className="py-2 px-4 font-medium" title="FTDs that only qualified after a retention deposit in a later month">Late</th>
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
                      {a.late > 0 ? (
                        <button
                          type="button"
                          className="text-warning underline underline-offset-2"
                          onClick={() => setLateView({ title: `Late FTDs — ${a.name}`, rows: a.lateRows })}
                        >
                          {a.late}
                        </button>
                      ) : (
                        0
                      )}
                    </td>
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
                    {totals.late > 0 ? (
                      <button
                        type="button"
                        className="text-warning underline underline-offset-2"
                        onClick={() => setLateView({ title: "All late FTDs", rows: totals.lateRows })}
                      >
                        {totals.late}
                      </button>
                    ) : (
                      0
                    )}
                  </td>
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

      <Dialog open={!!lateView} onOpenChange={(o) => { if (!o) setLateView(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{lateView?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            These FTDs are credited to the conversion agent in the month they became valid — the client only cleared the
            threshold after a retention deposit in a later month.
          </p>
          <div className="max-h-[60vh] overflow-auto scroll-slim">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 px-3 font-medium">Client</th>
                  <th className="py-2 px-3 font-medium">Agent</th>
                  <th className="py-2 px-3 font-medium">Activated</th>
                  <th className="py-2 px-3 font-medium">Qualified</th>
                  <th className="py-2 px-3 font-medium">Balance</th>
                  <th className="py-2 px-3 font-medium">Potential</th>
                </tr>
              </thead>
              <tbody>
                {(lateView?.rows ?? []).map((p) => (
                  <tr
                    key={p.row.id}
                    className="border-t border-border/50 cursor-pointer hover:bg-muted/30"
                    onClick={() => {
                      setLateView(null);
                      navigate({ to: "/activations", search: { client: p.row.id } as any });
                    }}
                  >
                    <td className="py-2 px-3">
                      {p.row.lead_name || "—"}
                      <LateFtdBadge
                        className="ml-2"
                        activationDate={actDate(p.row)}
                        qualifiedAt={p.row.qualified_at}
                        months={monthsLate(p.row as any)}
                      />
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{p.agent}</td>
                    <td className="py-2 px-3">{actDate(p.row) ? fmtDate(actDate(p.row)!) : "—"}</td>
                    <td className="py-2 px-3">{p.row.qualified_at ? fmtDate(p.row.qualified_at) : "—"}</td>
                    <td className="py-2 px-3 num">{fmtMoney(p.balance)}</td>
                    <td className="py-2 px-3">
                      {p.row.potential ? <PotentialBadge potential={p.row.potential} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

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
