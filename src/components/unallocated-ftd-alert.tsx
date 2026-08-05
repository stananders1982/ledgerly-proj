/**
 * App-wide alert: valid (qualified) FTDs that have no retention agent holding
 * them — either no agent at all, or an agent who isn't on the retention team.
 * Checked across all time, independent of any page's date range, so an
 * unallocated FTD is never hidden by the period you're looking at.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function UnallocatedFtdAlert() {
  const { data } = useQuery({
    queryKey: ["unallocated-ftds"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [acts, emps] = await Promise.all([
        supabase
          .from("daily_lead_activations")
          .select("id,lead_name,qualified_at,employee_id")
          .not("qualified_at", "is", null)
          .order("qualified_at", { ascending: false }),
        // Directory RPC: readable by every signed-in user, unlike the
        // employees table which is restricted for non-admins.
        supabase.rpc("list_employees_directory"),
      ]);
      if (acts.error) throw acts.error;
      if (emps.error) throw emps.error;
      const retention = new Set(
        (emps.data ?? []).filter((e: any) => e.team === "R").map((e: any) => e.id),
      );
      return (acts.data ?? []).filter((a) => !a.employee_id || !retention.has(a.employee_id));
    },
  });

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const names = rows
    .map((r) => (r.lead_name ?? "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  return (
    <Link
      to="/activations"
      search={{ issue: "clients-unallocated-ftd" } as any}
      className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 transition-colors hover:bg-amber-500/20"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold tabular-nums">{rows.length}</span> valid FTD
        {rows.length === 1 ? " has" : "s have"} no retention agent holding
        {rows.length === 1 ? " it" : " them"}
        {names ? <span className="text-muted-foreground"> — {names}{rows.length > 3 ? "…" : ""}</span> : null}. Assign a
        Team R agent so the client is followed up and STDs are credited.
      </p>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
