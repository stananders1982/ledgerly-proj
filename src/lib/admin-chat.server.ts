/**
 * Server-side helpers for the Admin assistant chat.
 *
 * The assistant runs with the *caller's* Supabase client, so row-level rules
 * still apply, and every request re-checks that the caller is a workspace
 * admin before any permission tooling is exposed to the model.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => {};
  let runIdResolved = false;
  const runIdReady = new Promise<string | undefined>((resolve) => {
    resolveRunId = resolve;
  });

  const publishRunId = (value?: string) => {
    const nextRunId = value?.trim() || undefined;
    if (!runId && nextRunId) runId = nextRunId;
    if (!runIdResolved) {
      runIdResolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publishRunId(runId);

  return {
    fetch: (async (input: any, init: any) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      try {
        const response = await fetch(input, { ...init, headers });
        publishRunId(response.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined);
        return response;
      } catch (error) {
        publishRunId(undefined);
        throw error;
      }
    }) as typeof fetch,
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : runIdReady),
  };
}

export function getLovableAiGatewayRunId(request: Request) {
  return request.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || undefined;
}

export type AdminContext = {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
  companyId: string;
};

/** Resolve the caller from the bearer token and confirm they administer a workspace. */
export async function requireAdminFromRequest(request: Request): Promise<AdminContext> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Response("Backend is not configured", { status: 500 });

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: claims, error } = await supabase.auth.getClaims(token);
  const userId = claims?.claims?.sub as string | undefined;
  if (error || !userId) throw new Response("Unauthorized", { status: 401 });

  const [{ data: roles }, { data: member }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("company_users").select("company_id").eq("user_id", userId).maybeSingle(),
  ]);

  const isAdmin = !!roles?.some((r) => r.role === "admin");
  if (!isAdmin) throw new Response("Admins only", { status: 403 });
  if (!member?.company_id) throw new Response("No workspace selected", { status: 400 });

  return { supabase, userId, companyId: member.company_id };
}
