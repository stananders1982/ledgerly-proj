/**
 * Admin-side reads and writes for the permission matrices.
 * Every write is captured in activity_log by database triggers.
 */
import { supabase } from "@/integrations/supabase/client";

export type MatrixRow = {
  id: string;
  role_key: string;
  nav_key: string | null;
  action_key: string | null;
  allowed: boolean;
};

export type OverrideRow = {
  id: string;
  user_id: string;
  nav_key: string | null;
  action_key: string | null;
  allowed: boolean;
};

export type PermRef = { navKey?: string | null; actionKey?: string | null };

export async function fetchRolePermissions() {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("id, role_key, nav_key, action_key, allowed");
  if (error) throw error;
  return (data ?? []) as MatrixRow[];
}

export async function fetchUserOverrides() {
  const { data, error } = await supabase
    .from("user_permission_overrides")
    .select("id, user_id, nav_key, action_key, allowed");
  if (error) throw error;
  return (data ?? []) as OverrideRow[];
}

export function permMatches(row: { nav_key: string | null; action_key: string | null }, ref: PermRef) {
  return (row.nav_key ?? null) === (ref.navKey ?? null) && (row.action_key ?? null) === (ref.actionKey ?? null);
}

export function keyOf(ref: PermRef) {
  return ref.navKey ? `nav:${ref.navKey}` : `action:${ref.actionKey}`;
}

/** Upsert a single role/permission cell (the unique index is expression-based, so match-then-write). */
export async function setRolePermission(opts: {
  companyId: string;
  roleKey: string;
  ref: PermRef;
  allowed: boolean;
}) {
  const { companyId, roleKey, ref, allowed } = opts;



  let query = supabase.from("role_permissions").select("id").eq("company_id", companyId).eq("role_key", roleKey);
  query = ref.navKey ? query.eq("nav_key", ref.navKey) : query.is("nav_key", null);
  query = ref.actionKey ? query.eq("action_key", ref.actionKey) : query.is("action_key", null);
  const { data: found, error: findErr } = await query.maybeSingle();
  if (findErr) throw findErr;

  if (found) {
    const { error } = await supabase.from("role_permissions").update({ allowed }).eq("id", found.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("role_permissions").insert({
    company_id: companyId,
    role_key: roleKey,
    nav_key: ref.navKey ?? null,
    action_key: ref.actionKey ?? null,
    allowed,
  });
  if (error) throw error;
}

/** Set (or clear) a per-user override. `allowed: null` removes the override. */
export async function setUserOverride(opts: {
  companyId: string;
  userId: string;
  ref: PermRef;
  allowed: boolean | null;
}) {
  const { companyId, userId, ref, allowed } = opts;
  let query = supabase
    .from("user_permission_overrides")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId);
  query = ref.navKey ? query.eq("nav_key", ref.navKey) : query.is("nav_key", null);
  query = ref.actionKey ? query.eq("action_key", ref.actionKey) : query.is("action_key", null);
  const { data: found, error: findErr } = await query.maybeSingle();
  if (findErr) throw findErr;

  if (allowed === null) {
    if (!found) return;
    const { error } = await supabase.from("user_permission_overrides").delete().eq("id", found.id);
    if (error) throw error;
    return;
  }
  if (found) {
    const { error } = await supabase.from("user_permission_overrides").update({ allowed }).eq("id", found.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("user_permission_overrides").insert({
    company_id: companyId,
    user_id: userId,
    nav_key: ref.navKey ?? null,
    action_key: ref.actionKey ?? null,
    allowed,
  });
  if (error) throw error;
}

export async function clearUserOverrides(companyId: string, userId: string) {
  const { error } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", userId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Role defaults                                                       */
/* ------------------------------------------------------------------ */

const MANAGER_NAV_EXCLUDES = ["settings", "users", "permissions", "logs", "activity"];
const AGENT_NAV = ["dashboard", "leads", "activations", "revenue", "tasks", "performance"];
const RETENTION_NAV = ["dashboard", "activations", "revenue", "withdrawals", "tasks", "performance"];
const MANAGER_ACTION_EXCLUDES = ["edit_settings", "manage_api_keys"];
const AGENT_ACTIONS = ["export_data", "manage_tasks"];
const RETENTION_ACTIONS = ["export_data", "manage_tasks", "approve_withdrawals"];

export function defaultNavAllowed(roleKey: string, navKey: string) {
  if (roleKey === "admin") return true;
  if (roleKey === "manager") return !MANAGER_NAV_EXCLUDES.includes(navKey);
  if (roleKey === "agent") return AGENT_NAV.includes(navKey);
  if (roleKey === "retention") return RETENTION_NAV.includes(navKey);
  return false;
}

export function defaultActionAllowed(roleKey: string, actionKey: string) {
  if (roleKey === "admin") return true;
  if (roleKey === "manager") return !MANAGER_ACTION_EXCLUDES.includes(actionKey);
  if (roleKey === "agent") return AGENT_ACTIONS.includes(actionKey);
  if (roleKey === "retention") return RETENTION_ACTIONS.includes(actionKey);
  return false;
}

export async function resetRoleDefaults(opts: {
  companyId: string;
  roleKey: string;
  navKeys: string[];
  actionKeys: string[];
}) {
  const { companyId, roleKey, navKeys, actionKeys } = opts;
  const { error: delErr } = await supabase
    .from("role_permissions")
    .delete()
    .eq("company_id", companyId)
    .eq("role_key", roleKey);
  if (delErr) throw delErr;

  const rows = [
    ...navKeys.map((n) => ({
      company_id: companyId,
      role_key: roleKey,
      nav_key: n,
      action_key: null,
      allowed: defaultNavAllowed(roleKey, n),
    })),
    ...actionKeys.map((a) => ({
      company_id: companyId,
      role_key: roleKey,
      nav_key: null,
      action_key: a,
      allowed: defaultActionAllowed(roleKey, a),
    })),
  ];
  const { error } = await supabase.from("role_permissions").insert(rows);
  if (error) throw error;
}
