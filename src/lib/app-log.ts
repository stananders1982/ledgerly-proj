import { supabase } from "@/integrations/supabase/client";

export type LogLevel = "info" | "warning" | "error" | "security";

/** Best-effort client-side event logging into app_logs. Never throws. */
export async function logEvent(opts: {
  level?: LogLevel;
  source?: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    let companyId: string | null = null;
    try {
      companyId = typeof window !== "undefined" ? window.localStorage.getItem("active_company_id") : null;
    } catch {
      /* ignore */
    }
    await supabase.from("app_logs").insert({
      level: opts.level ?? "info",
      source: opts.source ?? "app",
      message: opts.message.slice(0, 500),
      details: (opts.details ?? null) as never,
      path: typeof window !== "undefined" ? window.location.pathname : null,
      user_id: user.id,
      user_email: user.email ?? null,
      company_id: companyId,
    });
  } catch {
    /* logging must never break the app */
  }
}
