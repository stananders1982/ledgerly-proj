import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtPct, fmtDate, fmtMoney } from "@/lib/format";
import { AnsweredBadge, PotentialBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type SourceInfo = { name: string } | null;
type EntryInfo = {
  entry_date: string;
  source_id: string | null;
  lead_sources?: SourceInfo;
} | null;

type ActRow = {
  id: string;
  employee_id: string;
  activated_count: number;
  activation_date: string | null;
  lead_name: string | null;
  balance: number;
  potential: string | null;
  answered: boolean;
  qualified_at: string | null;
  conversion_employee_id: string | null;
  daily_lead_entries?: EntryInfo;
};

const actDate = (r: ActRow) => r.activation_date ?? r.daily_lead_entries?.entry_date ?? null;

/**
 * Retention-side leaderboard: how many activated leads each employee received
 * in the selected period. Lives on the Clients page.
 */
export function ActivatedLeadsByEmployee({
  start,
  end,
  label,
}: {
  start: Date;
  end: Date;
  label?: string;
}) {
  const [viewingEmployee, setViewingEmployee] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const activationsQ = useQuery({
    queryKey: ["activated-leads"],
    queryFn: async () => {
      const data = await fetchAll(() =>
        supabase
          .from("daily_lead_activations")
          .select("*, daily_lead_entries(entry_date, source_id, lead_sources(name))")
          .order("created_at", { ascending: false }),
      );
      return (data ?? []) as unknown as ActRow[];
    },
  });

  const employeesQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const s = useMemo(() => new Date(start).setHours(0, 0, 0, 0), [start]);
  const e = useMemo(() => new Date(end).setHours(23, 59, 59, 999), [end]);

  const byEmployee = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of activationsQ.data ?? []) {
      const d = actDate(a);
      if (!d) continue;
      const t = new Date(d + "T00:00:00").getTime();
      if (t < s || t > e) continue;
      if (!a.employee_id) continue;
      totals.set(a.employee_id, (totals.get(a.employee_id) ?? 0) + (a.activated_count ?? 0));
    }
    const nameOf = (id: string) =>
      (employeesQ.data ?? []).find((x) => x.id === id)?.name ?? "—";
    return Array.from(totals.entries())
      .map(([id, count]) => ({ id, name: nameOf(id), count }))
      .sort((a, b) => b.count - a.count);
  }, [activationsQ.data, employeesQ.data, s, e]);

  const total = byEmployee.reduce((sum, x) => sum + x.count, 0);

  const employeeFtds = useMemo(() => {
    if (!viewingEmployee) return [];
    return (activationsQ.data ?? [])
      .filter((a) => {
        if (a.employee_id !== viewingEmployee.id) return false;
        const d = actDate(a);
        if (!d) return false;
        const t = new Date(d + "T00:00:00").getTime();
        return t >= s && t <= e;
      })
      .sort((a, b) => {
        const da = new Date(actDate(a) ?? 0).getTime();
        const db = new Date(actDate(b) ?? 0).getTime();
        return db - da;
      });
  }, [activationsQ.data, viewingEmployee, s, e]);

  return (
    <div className="card-surface p-4 mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Activated leads by employee</h3>
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
      </div>
      {byEmployee.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No employee attributions yet. Open an entry on the Leads page and assign activated leads
          to employees.
        </p>
      ) : (
        <div className="overflow-x-auto scroll-slim">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-2 px-3">AGENT</th>
                <th className="py-2 px-3">FTDs</th>
                <th className="py-2 px-3">SHARE</th>
              </tr>
            </thead>
            <tbody>
              {byEmployee.map((emp) => (
                <tr key={emp.id} className="border-b border-border/50">
                  <td className="py-2 px-3 font-medium">{emp.name}</td>
                  <td className="py-2 px-3 num">
                    <button
                      type="button"
                      onClick={() => setViewingEmployee(emp)}
                      className="font-semibold text-primary hover:underline focus:outline-none focus:underline"
                    >
                      {emp.count}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground num">
                    {fmtPct(total ? (emp.count / total) * 100 : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!viewingEmployee} onOpenChange={(open) => !open && setViewingEmployee(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewingEmployee?.name} — FTDs</DialogTitle>
            <DialogDescription>
              {employeeFtds.length} activated lead{employeeFtds.length === 1 ? "" : "s"} in the selected period.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto scroll-slim -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Lead</th>
                  <th className="py-2 px-3">Balance</th>
                  <th className="py-2 px-3">Potential</th>
                  <th className="py-2 px-3">Answered</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {employeeFtds.map((ftd) => (
                  <tr key={ftd.id} className="border-b border-border/50">
                    <td className="py-2 px-3 whitespace-nowrap">{fmtDate(actDate(ftd))}</td>
                    <td className="py-2 px-3 font-medium">{ftd.lead_name ?? "—"}</td>
                    <td className="py-2 px-3 num">{fmtMoney(ftd.balance)}</td>
                    <td className="py-2 px-3">
                      <PotentialBadge potential={ftd.potential} />
                    </td>
                    <td className="py-2 px-3">
                      <AnsweredBadge answered={ftd.answered} />
                    </td>
                    <td className="py-2 px-3">
                      {ftd.qualified_at ? (
                        <Badge variant="default">Qualified</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
