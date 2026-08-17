import { supabase } from "@/integrations/supabase/client";

export type GoalEntityType = "company" | "source" | "employee";
export type GoalMetric = "revenue" | "ftds" | "stds" | "activations" | "deposits";

export interface Goal {
  id: string;
  company_id: string;
  entity_type: GoalEntityType;
  entity_id: string | null;
  target_metric: GoalMetric;
  target_value: number;
  period_month: string; // YYYY-MM
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  revenue: "Revenue",
  ftds: "FTDs",
  stds: "STDs",
  activations: "Activations",
  deposits: "Deposits",
};

export const GOAL_ENTITY_LABELS: Record<GoalEntityType, string> = {
  company: "Company",
  source: "Lead source",
  employee: "Employee",
};

const sb = supabase as any;

export function fetchGoals(periodMonth?: string) {
  let q = sb.from("goals").select("*").order("entity_type").order("target_metric");
  if (periodMonth) q = q.eq("period_month", periodMonth);
  return q;
}

export async function upsertGoal(
  goal: Partial<Goal> & { target_value: number; target_metric: GoalMetric; entity_type: GoalEntityType; period_month: string },
  companyId: string,
  userId?: string | null,
) {
  const payload = {
    entity_type: goal.entity_type,
    entity_id: goal.entity_id ?? null,
    target_metric: goal.target_metric,
    target_value: Number(goal.target_value),
    period_month: goal.period_month,
    company_id: companyId,
    created_by: userId ?? null,
  };
  if (goal.id) {
    const { error } = await sb.from("goals").update(payload).eq("id", goal.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from("goals").insert(payload);
    if (error) throw error;
  }
}

export async function deleteGoal(id: string) {
  const { error } = await sb.from("goals").delete().eq("id", id);
  if (error) throw error;
}

export function goalProgress(value: number, target: number): { pct: number; done: boolean; remaining: number } {
  if (!target || target <= 0) return { pct: 0, done: false, remaining: 0 };
  const pct = Math.min(100, (value / target) * 100);
  return { pct, done: value >= target, remaining: Math.max(0, target - value) };
}

export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function projectToMonthEnd(valueSoFar: number, startDate: Date, endDate: Date): number {
  const now = new Date();
  const end = endDate > now ? now : endDate;
  const daysElapsed = Math.max(1, Math.round((end.getTime() - startDate.getTime()) / 86400000) + 1);
  const daysTotal = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  return (valueSoFar / daysElapsed) * daysTotal;
}
