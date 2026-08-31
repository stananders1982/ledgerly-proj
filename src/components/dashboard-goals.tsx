import { useMemo } from "react";
import { toBase } from "@/lib/fx";
import { getDisplayCurrency } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { Target, TrendingUp, Users, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import {
  GOAL_METRIC_LABELS,
  GOAL_ENTITY_LABELS,
  fetchGoals,
  goalProgress,
  type Goal,
  type GoalEntityType,
  type GoalMetric,
} from "@/lib/goals";

const sb = supabase as any;

export function DashboardGoals({ start, end }: { start: Date; end: Date }) {
  const period = useMemo(() => {
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [start]);

  const rangeStart = useMemo(() => {
    const d = new Date(start);
    d.setDate(1);
    return d;
  }, [start]);
  const rangeEnd = useMemo(() => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return d > end ? d : end;
  }, [start, end]);

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const goalsQ = useQuery({
    queryKey: ["dash-goals", period],
    queryFn: async () => {
      const { data, error } = await fetchGoals(period);
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });

  const revenueQ = useQuery({
    queryKey: ["dash-goals-revenue", iso(rangeStart), iso(rangeEnd)],
    queryFn: async () => await fetchAll(() => sb.from("revenue").select("amount,currency,employee_id,employee_id_2,split_pct").gte("date", iso(rangeStart)).lte("date", iso(rangeEnd))),
  });

  const activationsQ = useQuery({
    queryKey: ["dash-goals-activations", iso(rangeStart), iso(rangeEnd)],
    queryFn: async () => {
      const { data, error } = await sb
        .from("daily_lead_activations")
        .select("id,conversion_employee_id,employee_id,qualified_at,activation_date,entry_id")
        .eq("legacy", false)
        .gte("activation_date", iso(rangeStart))
        .lte("activation_date", iso(rangeEnd));
      if (error) throw error;
      return data ?? [];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["dash-goals-entries", iso(rangeStart), iso(rangeEnd)],
    queryFn: async () => {
      const { data, error } = await sb
        .from("daily_lead_entries")
        .select("id,source_id,activated")
        .gte("entry_date", iso(rangeStart))
        .lte("entry_date", iso(rangeEnd));
      if (error) throw error;
      return (data ?? []) as { id: string; source_id: string; activated: number }[];
    },
  });

  const depositsQ = useQuery({
    queryKey: ["dash-goals-deposits", iso(rangeStart), iso(rangeEnd)],
    queryFn: async () => await fetchAll(() => sb.from("revenue").select("amount,currency,employee_id,employee_id_2,split_pct,activation_id").gte("date", iso(rangeStart)).lte("date", iso(rangeEnd))),
  });

  const employeesQ = useQuery({
    queryKey: ["dash-goals-employees"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean; team: string }[];
    },
  });

  const sourcesQ = useQuery({
    queryKey: ["dash-goals-sources"],
    queryFn: async () => {
      const { data, error } = await sb.from("lead_sources").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const actuals = useMemo(() => {
    const revenue = (revenueQ.data ?? []).reduce((s: number, r: any) => s + toDisplay(r.amount, r.currency), 0);

    const activations = (activationsQ.data ?? []).length;
    const deposits = (depositsQ.data ?? []).reduce((s: number, r: any) => s + toDisplay(r.amount, r.currency), 0);
    const ftdsByEmp = new Map<string, number>();
    const depositsByEmp = new Map<string, number>();
    const activationsBySource = new Map<string, number>();
    const depositsBySource = new Map<string, number>();

    const entriesById = new Map<string, { source_id: string; activated: number }>();
    for (const e of (entriesQ.data ?? []) as any[]) {
      entriesById.set(e.id, e);
    }

    for (const a of (activationsQ.data ?? []) as any[]) {
      if (a.conversion_employee_id) {
        ftdsByEmp.set(a.conversion_employee_id, (ftdsByEmp.get(a.conversion_employee_id) ?? 0) + 1);
      }
      const entry = entriesById.get(a.entry_id);
      if (entry?.source_id) {
        activationsBySource.set(entry.source_id, (activationsBySource.get(entry.source_id) ?? 0) + 1);
      }
    }

    for (const r of (depositsQ.data ?? []) as any[]) {
      const amt = toDisplay(r.amount, r.currency);
      if (r.employee_id) {
        depositsByEmp.set(r.employee_id, (depositsByEmp.get(r.employee_id) ?? 0) + amt);
      }
      if (r.employee_id_2) {
        depositsByEmp.set(r.employee_id_2, (depositsByEmp.get(r.employee_id_2) ?? 0) + amt);
      }
      if (r.activation_id) {
        const entry = entriesById.get(r.activation_id);
        if (entry?.source_id) {
          depositsBySource.set(entry.source_id, (depositsBySource.get(entry.source_id) ?? 0) + amt);
        }
      }
    }

    return {
      revenue,
      activations,
      deposits,
      ftdsByEmp,
      depositsByEmp,
      activationsBySource,
      depositsBySource,
    };
  }, [revenueQ.data, activationsQ.data, depositsQ.data, entriesQ.data]);

  const namedEntity = (g: Goal) => {
    if (g.entity_type === "company") return "Company";
    if (g.entity_type === "employee") {
      const e = (employeesQ.data ?? []).find((x) => x.id === g.entity_id);
      return e?.name ?? "Unknown";
    }
    if (g.entity_type === "source") {
      const s = (sourcesQ.data ?? []).find((x) => x.id === g.entity_id);
      return s?.name ?? "Unknown";
    }
    return "Unknown";
  };

  const actualFor = (g: Goal) => {
    if (g.entity_type === "company") {
      if (g.target_metric === "revenue") return actuals.revenue;
      if (g.target_metric === "activations") return actuals.activations;
      if (g.target_metric === "deposits") return actuals.deposits;
    }
    if (g.entity_type === "employee") {
      if (g.target_metric === "revenue") return actuals.depositsByEmp.get(g.entity_id!) ?? 0;
      if (g.target_metric === "ftds") return actuals.ftdsByEmp.get(g.entity_id!) ?? 0;
      if (g.target_metric === "deposits") return actuals.depositsByEmp.get(g.entity_id!) ?? 0;
    }
    if (g.entity_type === "source") {
      if (g.target_metric === "activations" || g.target_metric === "ftds") return actuals.activationsBySource.get(g.entity_id!) ?? 0;
      if (g.target_metric === "revenue" || g.target_metric === "deposits") return actuals.depositsBySource.get(g.entity_id!) ?? 0;
    }
    return 0;
  };

  const format = (g: Goal, v: number) =>
    g.target_metric === "revenue" || g.target_metric === "deposits" ? fmtMoney(v) : v.toLocaleString();

  const byType = (type: GoalEntityType) => (goalsQ.data ?? []).filter((g) => g.entity_type === type);

  if (!goalsQ.data?.length) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {(["company", "source", "employee"] as GoalEntityType[]).map((type) => {
        const list = byType(type);
        if (!list.length) return null;
        return (
          <div key={type} className="glass-surface glass-hover p-4 sm:p-5 min-w-0">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-md bg-accent/60 flex items-center justify-center text-muted-foreground">
                {type === "company" ? <TrendingUp className="h-3.5 w-3.5" /> : type === "source" ? <Tag className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              </div>
              <h3 className="font-display text-sm font-semibold">{GOAL_ENTITY_LABELS[type]}</h3>
              <span className="ml-auto text-xs text-muted-foreground">{period}</span>
            </div>
            <div className="space-y-3">
              {list.map((g) => {
                const value = actualFor(g);
                const { pct, done } = goalProgress(value, g.target_value);
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{GOAL_METRIC_LABELS[g.target_metric]} · {namedEntity(g)}</span>
                      <span className={cn("font-medium", done && "text-emerald-500")}>
                        {format(g, value)} / {format(g, g.target_value)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", done ? "bg-emerald-500" : "bg-primary")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
