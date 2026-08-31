/**
 * Safe wrappers around the recurring generators.
 * The server functions require a Supabase bearer token, so we only call them
 * once a session actually exists (avoids "Unauthorized: No authorization header").
 */
import { supabase } from "@/integrations/supabase/client";

async function hasSession() {
  if (typeof window === "undefined") return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session?.access_token;
}

export async function runDueRecurringExpenses(): Promise<{ count: number }> {
  if (!(await hasSession())) return { count: 0 };
  const { generateDueRecurringExpenses } = await import("@/lib/recurring.functions");
  return await generateDueRecurringExpenses();
}

export async function runDueRecurringRevenue(): Promise<{ count: number }> {
  if (!(await hasSession())) return { count: 0 };
  const { generateDueRecurringRevenue } = await import("@/lib/recurring.functions");
  return await generateDueRecurringRevenue();
}
