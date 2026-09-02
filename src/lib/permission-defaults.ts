/**
 * Role defaults — kept free of browser imports so both the app and the
 * server-side assistant can reason about them.
 */
import { defaultDashboardAllowed, isDashboardSectionKey } from "@/lib/dashboard-sections";

const MANAGER_NAV_EXCLUDES = ["settings", "users", "permissions", "logs", "activity"];
const AGENT_NAV = ["dashboard", "leads", "revenue", "deposit-requests", "tasks", "performance"];
const RETENTION_NAV = ["dashboard", "activations", "revenue", "deposit-requests", "withdrawals", "tasks", "performance"];
const MANAGER_ACTION_EXCLUDES = ["edit_settings", "manage_api_keys"];
const AGENT_ACTIONS = ["export_data", "manage_tasks"];
const RETENTION_ACTIONS = ["export_data", "manage_tasks", "approve_withdrawals"];

export function defaultNavAllowed(roleKey: string, navKey: string) {
  if (isDashboardSectionKey(navKey)) return defaultDashboardAllowed(roleKey, navKey);
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
