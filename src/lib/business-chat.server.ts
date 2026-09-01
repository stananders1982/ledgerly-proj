/**
 * Server-side helpers for the Business assistant chat.
 *
 * The assistant runs with the *caller's* Supabase client, so row-level rules
 * still apply. Any authenticated workspace member may use it.
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

export type BusinessContext = {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
  companyId: string;
};

/** Resolve the caller from the bearer token and confirm they belong to a workspace. */
export async function requireUserFromRequest(request: Request): Promise<BusinessContext> {
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

  const { data: member } = await supabase.from("company_users").select("company_id").eq("user_id", userId).maybeSingle();
  if (!member?.company_id) throw new Response("No workspace selected", { status: 400 });

  return { supabase, userId, companyId: member.company_id };
}
