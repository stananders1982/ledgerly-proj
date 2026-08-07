/**
 * Guided setup (onboarding) state for a company/tenant.
 *
 * A brand-new workspace has no lead sources, agents or affiliates. When that
 * is the case we show a 4-step wizard once. Progress lives in
 * `company_onboarding` (one row per company) so it does not reappear after a
 * reload or on another device.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StepStatus = "pending" | "done" | "skipped";

export type OnboardingRow = {
  company_id: string;
  step_basics: StepStatus;
  step_source: StepStatus;
  step_agent: StepStatus;
  step_affiliate: StepStatus;
  completed_at: string | null;
};

export const ONBOARDING_QUERY_KEY = ["company-onboarding"] as const;

export type OnboardingState = {
  row: OnboardingRow | null;
  /** True when the workspace has no sources, agents and affiliates. */
  isEmptyWorkspace: boolean;
  counts: { sources: number; employees: number; affiliates: number };
};

async function count(table: "lead_sources" | "employees" | "affiliates") {
  const { count: n } = await supabase.from(table).select("id", { count: "exact", head: true });
  return n ?? 0;
}

export function useOnboardingState() {
  return useQuery<OnboardingState>({
    queryKey: ONBOARDING_QUERY_KEY,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [row, sources, employees, affiliates] = await Promise.all([
        supabase
          .from("company_onboarding")
          .select("company_id,step_basics,step_source,step_agent,step_affiliate,completed_at")
          .maybeSingle()
          .then((r) => (r.data as OnboardingRow | null) ?? null),
        count("lead_sources"),
        count("employees"),
        count("affiliates"),
      ]);
      return {
        row,
        counts: { sources, employees, affiliates },
        isEmptyWorkspace: sources === 0 && employees === 0 && affiliates === 0,
      };
    },
  });
}

/** Should the wizard pop up on its own? Only for empty, never-finished workspaces. */
export function shouldAutoOpen(state?: OnboardingState | null) {
  if (!state) return false;
  if (state.row?.completed_at) return false;
  return state.isEmptyWorkspace;
}

/** Writes step progress for the current company (admins only, enforced by RLS). */
export async function saveOnboarding(companyId: string, patch: Partial<Omit<OnboardingRow, "company_id">>) {
  const { error } = await supabase
    .from("company_onboarding")
    .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" });
  if (error) throw error;
}
