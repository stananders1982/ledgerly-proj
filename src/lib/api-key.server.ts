// Server-only helpers for the public REST API (/api/public/v1/*).
// Validates bearer API keys against public.api_keys and scopes every query
// to the key's company_id. The service role client is used ONLY here and in
// the route handlers, and every query is company-scoped by hand.
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const API_PERMISSIONS = [
  "read_leads",
  "write_leads",
  "write_deposits",
  "read_reports",
] as const;
export type ApiPermission = (typeof API_PERMISSIONS)[number];

export type ApiKeyContext = {
  id: string;
  name: string;
  companyId: string;
  permissions: string[];
};

export function hashApiKey(raw: string) {
  return createHash("sha256").update(raw.trim()).digest("hex");
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

async function logApiCall(opts: {
  companyId: string | null;
  keyName: string;
  path: string;
  status: number;
  message: string;
  details?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("app_logs").insert({
      company_id: opts.companyId,
      level: "security",
      source: "api",
      message: opts.message,
      path: opts.path,
      details: {
        key_name: opts.keyName,
        endpoint: opts.path,
        status: opts.status,
        at: new Date().toISOString(),
        ...(opts.details ?? {}),
      },
    });
  } catch {
    // never fail an API call because logging failed
  }
}

type Ok = { ok: true; key: ApiKeyContext };
type Err = { ok: false; response: Response };

/** Validate the Authorization: Bearer <key> header and required permission. */
export async function authenticateApiKey(
  request: Request,
  path: string,
  required: ApiPermission,
): Promise<Ok | Err> {
  const header = request.headers.get("authorization") ?? "";
  const raw = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  if (!raw) {
    await logApiCall({ companyId: null, keyName: "(none)", path, status: 401, message: "API request without bearer key" });
    return { ok: false, response: jsonResponse({ error: "Missing Authorization: Bearer <api key>" }, 401) };
  }

  const { data: row } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, company_id, permissions, revoked_at, expires_at")
    .eq("key_hash", hashApiKey(raw))
    .maybeSingle();

  if (!row) {
    await logApiCall({ companyId: null, keyName: "(unknown)", path, status: 401, message: "API request with unknown key" });
    return { ok: false, response: jsonResponse({ error: "Invalid API key" }, 401) };
  }
  if (row.revoked_at) {
    await logApiCall({ companyId: row.company_id, keyName: row.name, path, status: 401, message: "API request with revoked key" });
    return { ok: false, response: jsonResponse({ error: "API key revoked" }, 401) };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    await logApiCall({ companyId: row.company_id, keyName: row.name, path, status: 401, message: "API request with expired key" });
    return { ok: false, response: jsonResponse({ error: "API key expired" }, 401) };
  }
  const permissions = (row.permissions ?? []) as string[];
  if (!permissions.includes(required)) {
    await logApiCall({
      companyId: row.company_id,
      keyName: row.name,
      path,
      status: 403,
      message: `API key missing permission ${required}`,
    });
    return { ok: false, response: jsonResponse({ error: `API key lacks '${required}' permission` }, 403) };
  }

  await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);

  return {
    ok: true,
    key: { id: row.id, name: row.name, companyId: row.company_id, permissions },
  };
}

/** Log a completed API call and return the response. */
export async function finish(key: ApiKeyContext, path: string, status: number, body: unknown) {
  await logApiCall({
    companyId: key.companyId,
    keyName: key.name,
    path,
    status,
    message: `API ${path} → ${status}`,
  });
  return jsonResponse(body, status);
}

export function clampLimit(value: string | null, fallback = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 500);
}

export function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
