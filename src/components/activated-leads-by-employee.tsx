import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtPct } from "@/lib/format";

type ActRow = {
  employee_id: string;
  activated_count: number;
  activation_date: string | null;
  daily_lead_entries?: { entry_date: string } | null;
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

  const byEmployee = useMemo(() => {
    const s = new Date(start).setHours(0, 0, 0, 0);
    const e = new Date(end).setHours(23, 59, 59, 999);
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
  }, [activationsQ.data, employeesQ.data, start, end]);

  const total = byEmployee.reduce((s, x) => s + x.count, 0);

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
                <th className="py-2 px-3">Employee</th>
                <th className="py-2 px-3">Activated leads</th>
                <th className="py-2 px-3">Share</th>
              </tr>
            </thead>
            <tbody>
              {byEmployee.map((e) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="py-2 px-3 font-medium">{e.name}</td>
                  <td className="py-2 px-3 num">{e.count}</td>
                  <td className="py-2 px-3 text-muted-foreground num">
                    {fmtPct(total ? (e.count / total) * 100 : 0)}
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
