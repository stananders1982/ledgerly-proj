/**
 * Shared catalog + client-side apply helpers for the Admin assistant.
 *
 * The model proposes changes; nothing is written until the admin presses
 * Apply in the chat, which runs the same helpers the Permissions page uses
 * (so database triggers keep recording every change in the activity log).
 */
import { supabase } from "@/integrations/supabase/client";
import { ACTION_PERMISSIONS } from "@/lib/permissions";
import { setUserOverride, clearUserOverrides, type PermRef } from "@/lib/permission-admin";

/** Pages the assistant may grant or revoke (admin-only pages are excluded). */
export const ASSISTANT_NAV_PAGES: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "leads", label: "Leads" },
  { key: "activations", label: "Clients" },
  { key: "sources", label: "Sources" },
  { key: "revenue", label: "Income" },
  { key: "withdrawals", label: "Withdrawals" },
  { key: "expenses", label: "Expenses" },
  { key: "recurring", label: "Recurring" },
  { key: "tasks", label: "Tasks" },
  { key: "import", label: "Import" },
  { key: "employees", label: "Employees" },
  { key: "performance", label: "Performance" },
  { key: "attendance", label: "Attendance" },
  { key: "reports", label: "Reports" },
  { key: "affiliates", label: "Affiliates" },
  { key: "data-quality", label: "Data Quality" },
];

export const ASSISTANT_ACTIONS = ACTION_PERMISSIONS.map((a) => ({ key: a.key, label: a.label }));

export function navLabel(key: string) {
  return ASSISTANT_NAV_PAGES.find((p) => p.key === key)?.label ?? key;
}

export function actionLabel(key: string) {
  return ASSISTANT_ACTIONS.find((a) => a.key === key)?.label ?? key;
}

/* ------------------------------------------------------------------ */
/* Tool payloads                                                       */
/* ------------------------------------------------------------------ */

export type SetPageAccessInput = {
  user_id: string;
  user_label: string;
  pages: string[];
  allowed: boolean;
};

export type SetActionPermissionInput = {
  user_id: string;
  user_label: string;
  actions: string[];
  allowed: boolean;
};

export type SetRoleInput = {
  user_id: string;
  user_label: string;
  role_key: string;
  role_label: string;
};

export type CopyAccessInput = {
  from_user_id: string;
  from_label: string;
  to_user_id: string;
  to_label: string;
};

export type ApplyResult = { applied: true; summary: string };

/* ------------------------------------------------------------------ */
/* Apply helpers (client side, run only after the admin confirms)      */
/* ------------------------------------------------------------------ */

export async function applySetPageAccess(companyId: string, input: SetPageAccessInput): Promise<ApplyResult> {
  for (const page of input.pages) {
    await setUserOverride({ companyId, userId: input.user_id, ref: { navKey: page }, allowed: input.allowed });
  }
  return {
    applied: true,
    summary: `${input.allowed ? "Granted" : "Revoked"} ${input.pages.map(navLabel).join(", ")} for ${input.user_label}.`,
  };
}

export async function applySetActionPermission(
  companyId: string,
  input: SetActionPermissionInput,
): Promise<ApplyResult> {
  for (const action of input.actions) {
    await setUserOverride({ companyId, userId: input.user_id, ref: { actionKey: action }, allowed: input.allowed });
  }
  return {
    applied: true,
    summary: `${input.allowed ? "Granted" : "Revoked"} ${input.actions.map(actionLabel).join(", ")} for ${input.user_label}.`,
  };
}

export async function applySetRole(companyId: string, input: SetRoleInput): Promise<ApplyResult> {
  const { data, error } = await supabase
    .from("company_users")
    .update({ role_key: input.role_key })
    .eq("company_id", companyId)
    .eq("user_id", input.user_id)
    .select("user_id");
  if (error) throw error;
  if (!data?.length) throw new Error("Role not changed — you may not have permission to edit this member.");
  return { applied: true, summary: `${input.user_label} is now ${input.role_label}.` };
}

export async function applyCopyAccess(companyId: string, input: CopyAccessInput): Promise<ApplyResult> {
  const [{ data: members, error: memberErr }, { data: overrides, error: ovErr }] = await Promise.all([
    supabase.from("company_users").select("user_id, role_key").eq("company_id", companyId),
    supabase
      .from("user_permission_overrides")
      .select("nav_key, action_key, allowed")
      .eq("company_id", companyId)
      .eq("user_id", input.from_user_id),
  ]);
  if (memberErr) throw memberErr;
  if (ovErr) throw ovErr;

  const source = members?.find((m) => m.user_id === input.from_user_id);
  if (!source) throw new Error("Source member not found in this workspace.");
  const roleKey = (source as { role_key?: string }).role_key ?? "agent";

  await applySetRole(companyId, {
    user_id: input.to_user_id,
    user_label: input.to_label,
    role_key: roleKey,
    role_label: roleKey,
  });

  await clearUserOverrides(companyId, input.to_user_id);
  for (const o of overrides ?? []) {
    const ref: PermRef = { navKey: o.nav_key, actionKey: o.action_key };
    await setUserOverride({ companyId, userId: input.to_user_id, ref, allowed: o.allowed });
  }

  return { applied: true, summary: `${input.to_label} now matches ${input.from_label}'s access.` };
}
