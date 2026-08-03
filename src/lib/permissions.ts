/**
 * Action-level permissions.
 *
 * Navigation permissions decide which pages a user can reach; these decide
 * what they can *do* once there. Admins always pass. The matching database
 * function `can_do()` enforces the same rules server-side, so hiding a button
 * here is a convenience, not the security boundary.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type ActionKey =
  | "delete_records"
  | "export_data"
  | "view_salaries"
  | "approve_withdrawals"
  | "edit_settings";

export const ACTION_PERMISSIONS: { key: ActionKey; label: string; hint: string }[] = [
  { key: "delete_records", label: "Delete records", hint: "Remove income, expenses, leads and clients." },
  { key: "export_data", label: "Export data", hint: "Download CSV, Excel and PDF exports." },
  { key: "view_salaries", label: "View salaries", hint: "See employee pay, commissions and payroll figures." },
  { key: "approve_withdrawals", label: "Approve withdrawals", hint: "Record and confirm client withdrawals." },
  { key: "edit_settings", label: "Edit company settings", hint: "Change thresholds, fees and branding." },
];

export const ACTION_PERMISSIONS_KEY = ["action-permissions", "me"] as const;

/** The set of actions the signed-in user is allowed to perform. */
export function useMyActions() {
  const { user, isAdmin } = useAuth();

  const q = useQuery({
    enabled: !!user && !isAdmin,
    queryKey: [...ACTION_PERMISSIONS_KEY, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_permissions")
        .select("action_key,allowed")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as { action_key: string; allowed: boolean }[];
    },
  });

  return useMemo(() => {
    if (isAdmin) return new Set<string>(ACTION_PERMISSIONS.map((a) => a.key));
    return new Set<string>((q.data ?? []).filter((r) => r.allowed).map((r) => r.action_key));
  }, [isAdmin, q.data]);
}

/** `can("export_data")` — true when the current user may perform the action. */
export function useCan() {
  const actions = useMyActions();
  return (key: ActionKey) => actions.has(key);
}
