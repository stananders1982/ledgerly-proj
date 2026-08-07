/**
 * Permission model.
 *
 * Resolution order (both here and in the database `effective_permission()`):
 *   1. per-user override   (user_permission_overrides)
 *   2. role default        (role_permissions, joined through company_users.role_key)
 *   3. legacy per-user row  (nav_permissions / action_permissions)
 *   4. denied
 *
 * Admins always pass. Hiding a button here is a convenience — `can_do()` and RLS
 * are the real security boundary.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { exportCSV, exportPDF, exportXLSX } from "@/lib/export";

export type ActionKey =
  | "delete_records"
  | "export_data"
  | "view_salaries"
  | "approve_withdrawals"
  | "edit_settings"
  | "import_data"
  | "manage_employees"
  | "manage_affiliates"
  | "manage_sources"
  | "view_reports"
  | "manage_api_keys"
  | "view_pnl"
  | "edit_commissions"
  | "manage_tasks";

export const ACTION_PERMISSIONS: { key: ActionKey; label: string; hint: string }[] = [
  { key: "delete_records", label: "Delete records", hint: "Remove income, expenses, leads and clients." },
  { key: "export_data", label: "Export data", hint: "Download CSV, Excel and PDF exports." },
  { key: "view_salaries", label: "View salaries", hint: "See employee pay, commissions and payroll figures." },
  { key: "approve_withdrawals", label: "Approve withdrawals", hint: "Record and confirm client withdrawals." },
  { key: "edit_settings", label: "Edit company settings", hint: "Change thresholds, fees and branding." },
  { key: "import_data", label: "Import data", hint: "Use the bulk import page." },
  { key: "manage_employees", label: "Manage employees", hint: "Add, edit and remove employees." },
  { key: "manage_affiliates", label: "Manage affiliates", hint: "Add, edit and remove affiliates." },
  { key: "manage_sources", label: "Manage sources", hint: "Add, edit and remove lead sources." },
  { key: "view_reports", label: "View reports", hint: "Open the Reports page." },
  { key: "manage_api_keys", label: "Manage API keys", hint: "Create and revoke API keys." },
  { key: "view_pnl", label: "View P&L", hint: "See profit and loss figures in reports." },
  { key: "edit_commissions", label: "Edit commissions", hint: "Manually adjust commission values." },
  { key: "manage_tasks", label: "Manage tasks", hint: "Create, assign and delete tasks." },
];

/** Pages every admin always keeps — they cannot be switched off. */
export const LOCKED_NAV_KEYS = ["dashboard", "settings", "users", "permissions"];

export type RoleOption = { key: string; label: string; builtin: boolean };

export const BUILTIN_ROLES: RoleOption[] = [
  { key: "admin", label: "Admin", builtin: true },
  { key: "manager", label: "Manager", builtin: true },
  { key: "agent", label: "Agent", builtin: true },
  { key: "retention", label: "Retention", builtin: true },
];

export const ROLES_QUERY_KEY = ["roles"] as const;
export const ROLE_PERMISSIONS_KEY = ["role-permissions"] as const;
export const USER_OVERRIDES_KEY = ["user-permission-overrides"] as const;
export const MY_PERMISSIONS_KEY = ["my-permissions"] as const;

/** Built-in roles plus any custom roles defined in this workspace. */
export function useRoles() {
  const { companyId } = useAuth();
  const q = useQuery({
    enabled: !!companyId,
    queryKey: [...ROLES_QUERY_KEY, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_roles").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const roles = useMemo<RoleOption[]>(
    () => [...BUILTIN_ROLES, ...(q.data ?? []).map((r) => ({ key: `custom:${r.id}`, label: r.name, builtin: false }))],
    [q.data],
  );
  return { roles, custom: q.data ?? [], isLoading: q.isLoading };
}

export type PermissionRow = { nav_key: string | null; action_key: string | null; allowed: boolean };

/** Everything the signed-in user is allowed to see and do. */
export function useMyPermissions() {
  const { user, isAdmin, companyId } = useAuth();

  const q = useQuery({
    enabled: !!user && !isAdmin,
    queryKey: [...MY_PERMISSIONS_KEY, user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_permissions");
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
  });

  return useMemo(() => {
    if (isAdmin) {
      return {
        loaded: true,
        navKeys: new Set<string>(),
        actions: new Set<string>(ACTION_PERMISSIONS.map((a) => a.key)),
      };
    }
    const rows = q.data ?? [];
    return {
      loaded: !q.isLoading,
      navKeys: new Set(rows.filter((r) => r.allowed && r.nav_key).map((r) => r.nav_key as string)),
      actions: new Set(rows.filter((r) => r.allowed && r.action_key).map((r) => r.action_key as string)),
    };
  }, [isAdmin, q.data, q.isLoading]);
}

/** The set of actions the signed-in user is allowed to perform. */
export function useMyActions() {
  return useMyPermissions().actions;
}

/** `can("export_data")` — true when the current user may perform the action. */
export function useCan() {
  const actions = useMyActions();
  return (key: ActionKey) => actions.has(key);
}

/* ------------------------------------------------------------------ */
/* Guarded exports                                                     */
/* ------------------------------------------------------------------ */

/**
 * Export helpers that respect the `export_data` permission. Use these instead
 * of importing from `@/lib/export` directly inside pages.
 */
export function useExporters() {
  const can = useCan();
  const allowed = can("export_data");
  const deny = () => toast.error("You don't have permission to export data.");
  return {
    canExport: allowed,
    exportCSV: (...args: Parameters<typeof exportCSV>) => (allowed ? exportCSV(...args) : deny()),
    exportXLSX: (...args: Parameters<typeof exportXLSX>) => (allowed ? exportXLSX(...args) : deny()),
    exportPDF: (...args: Parameters<typeof exportPDF>) => (allowed ? exportPDF(...args) : deny()),
  };
}
