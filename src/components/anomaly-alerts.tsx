import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bell, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { cn } from "@/lib/utils";
import { useAffiliateBalanceAlerts } from "@/lib/affiliate-alerts";
import {
  detectAnomalies, dismissAnomaly, readDismissed, daysAgo, isoDay,
  type Anomaly,
} from "@/lib/anomalies";

const sb = supabase as any;


/**
 * Smart alerts: everything unusual about the last few days, in one strip.
 * Each item can be dismissed and stays dismissed for this browser.
 */
export function AnomalyAlerts() {
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readDismissed(),
  );
  const since = useMemo(() => isoDay(daysAgo(60)), []);

  const q = useQuery({
    queryKey: ["anomaly-feed", since],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [revenue, expenses, withdrawals, activations, leads, sources, categories, employees] =
        await Promise.all([
          fetchAll(() => sb.from("revenue").select("date,amount,employee_id").gte("date", since)),
          fetchAll(() => sb.from("expenses").select("date,amount,category_id").gte("date", since)),
          fetchAll(() => sb.from("withdrawals").select("date,amount").gte("date", since)),
          fetchAll(() => sb.from("daily_lead_activations").select("activation_date,created_at,employee_id,conversion_employee_id").eq("legacy", false).gte("activation_date", since)),
          fetchAll(() => sb.from("daily_lead_entries").select("entry_date,received,source_id").gte("entry_date", since)),
          fetchAll(() => sb.from("lead_sources").select("id,name")),
          fetchAll(() => sb.from("expense_categories").select("id,name")),
          sb.rpc("list_employees_directory").then((r: any) => r.data ?? []),
        ]);
      return { revenue, expenses, withdrawals, activations, leads, sources, categories, employees };
    },
  });

  const anomalies = useMemo(() => {
    if (!q.data) return [] as Anomaly[];
    return detectAnomalies({
      revenue: (q.data.revenue ?? []) as any,
      expenses: (q.data.expenses ?? []) as any,
      withdrawals: (q.data.withdrawals ?? []) as any,
      activations: (q.data.activations ?? []) as any,
      leads: (q.data.leads ?? []) as any,
      sourcesById: new Map(((q.data.sources ?? []) as any[]).map((s) => [s.id, s.name])),
      categoriesById: new Map(((q.data.categories ?? []) as any[]).map((c) => [c.id, c.name])),
      employees: ((q.data.employees ?? []) as any[]).map((e) => ({ id: e.id, name: e.name, active: e.active, team: e.team })),
    });
  }, [q.data]);

  const visible = anomalies.filter((a) => !dismissed.includes(a.id));
  if (!visible.length) return null;

  const drop = (id: string) => {
    dismissAnomaly(id);
    setDismissed((prev) => [...prev, id]);
  };

  return (
    <section className="mb-6 grid gap-2">
      {visible.slice(0, 4).map((a) => {
        const Icon = a.severity === "info" ? Sparkles : a.severity === "critical" ? AlertTriangle : Bell;
        return (
          <div
            key={a.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
              a.severity === "critical" && "border-rose-500/40 bg-rose-500/10",
              a.severity === "warning" && "border-amber-500/40 bg-amber-500/10",
              a.severity === "info" && "border-sky-500/40 bg-sky-500/10",
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{a.title}</div>
              <div className="text-xs text-muted-foreground">{a.detail}</div>
            </div>
            {a.to && (
              <Link to={a.to} className="shrink-0 text-xs underline underline-offset-2 hover:no-underline">
                View
              </Link>
            )}
            <button
              type="button"
              aria-label="Dismiss alert"
              onClick={() => drop(a.id)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </section>
  );
}
