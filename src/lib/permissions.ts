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
import {
  DASHBOARD_SECTION_KEYS,
  defaultDashboardAllowed,
  isDashboardSectionKey,
} from "@/lib/dashboard-sections";

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
export const LOCKED_NAV_KEYS = ["settings", "users", "permissions"];

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
    // Permission changes made by an admin should land without a re-login.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
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
        dashboardSections: new Set<string>(DASHBOARD_SECTION_KEYS),
        dashboardExplicit: new Map<string, boolean>(),
      };
    }
    const rows = q.data ?? [];
    const allowedNav = rows.filter((r) => r.allowed && r.nav_key).map((r) => r.nav_key as string);
    // Keys with an explicit row (true *or* false). Anything absent falls back
    // to the role default, matching what the permissions matrix displays.
    const dashboardExplicit = new Map<string, boolean>();
    for (const r of rows) {
      if (r.nav_key && isDashboardSectionKey(r.nav_key)) dashboardExplicit.set(r.nav_key, !!r.allowed);
    }
    const navKeys = new Set(allowedNav.filter((k) => !isDashboardSectionKey(k)));
    // Seeing any dashboard block implies access to the Dashboard page itself.
    if (allowedNav.some(isDashboardSectionKey)) navKeys.add("dashboard");
    return {
      loaded: !q.isLoading,
      navKeys,
      actions: new Set(rows.filter((r) => r.allowed && r.action_key).map((r) => r.action_key as string)),
      dashboardSections: new Set(allowedNav.filter(isDashboardSectionKey)),
      dashboardExplicit,
    };
  }, [isAdmin, q.data, q.isLoading]);
}

/**
 * Explicit dashboard-section rows for the signed-in user: their per-user
 * overrides plus the rows saved for their role. `my_permissions()` cannot be
 * used here because it reports "no row for my role" as a hard `false`, which
 * would hide sections the permissions matrix shows as on (role default).
 */
function useDashboardExplicit() {
  const { user, companyId, isAdmin } = useAuth();
  const { roleKey } = useMyRoleKey();

  const q = useQuery({
    enabled: !!user && !!companyId && !isAdmin && !!roleKey,
    queryKey: ["dashboard-explicit", user?.id, companyId, roleKey],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    queryFn: async () => {

      const [roleRes, overrideRes] = await Promise.all([
        supabase.from("role_permissions").select("nav_key,allowed").eq("role_key", roleKey!).like("nav_key", "dash:%"),
        supabase.from("user_permission_overrides").select("nav_key,allowed").eq("user_id", user!.id).like("nav_key", "dash:%"),
      ]);
      if (roleRes.error) throw roleRes.error;
      if (overrideRes.error) throw overrideRes.error;
      const map = new Map<string, boolean>();
      for (const r of roleRes.data ?? []) if (r.nav_key) map.set(r.nav_key, !!r.allowed);
      for (const r of overrideRes.data ?? []) if (r.nav_key) map.set(r.nav_key, !!r.allowed);
      return map;
    },
  });

  return { explicit: q.data ?? new Map<string, boolean>(), loaded: !!q.data };
}

/**
 * Which dashboard blocks the signed-in user may see. Each section resolves
 * independently: an explicit allow/deny row wins, otherwise the role default.
 */
export function useVisibleDashboardSections() {
  const { isAdmin } = useAuth();
  const { explicit, loaded } = useDashboardExplicit();
  const { roleKey } = useMyRoleKey();

  return useMemo(() => {
    const can = (key: string) => {
      if (isAdmin) return true;
      if (!loaded || !roleKey) return false;
      const value = explicit.get(key);
      if (value !== undefined) return value;
      return defaultDashboardAllowed(roleKey, key);
    };
    return { loaded: isAdmin || loaded, can, any: DASHBOARD_SECTION_KEYS.some(can) };
  }, [isAdmin, loaded, explicit, roleKey]);
}



/** The current user's role key inside the active workspace. */
export function useMyRoleKey() {
  const { user, companyId, isAdmin } = useAuth();
  const q = useQuery({
    enabled: !!user && !!companyId && !isAdmin,
    queryKey: ["my-role-key", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_users")
        .select("role_key")
        .eq("company_id", companyId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.role_key as string | undefined) ?? "agent";
    },
  });
  return { roleKey: isAdmin ? "admin" : q.data, isLoading: q.isLoading };
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
