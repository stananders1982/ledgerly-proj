import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const JOB_KEY = "client-automation";
const LEASE_MINUTES = 10;
const MAX_CLIENTS = 500;
const MAX_TASKS_PER_RUN = 100;
const NEGLECT_WINDOW_DAYS = 14;

const daysBetween = (a: string, b: Date) =>
  Math.floor((b.getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);

/**
 * Client-care sweep: opens one follow-up task for every rated client who has
 * gone quiet for two weeks, so nobody valuable is left without a next step.
 *
 * Bounded per run, single-flight through a lease row, and idempotent through
 * tasks.auto_key — safe to call repeatedly.
 */
export const runClientAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { created: 0, skipped: "forbidden" as const };

    const now = new Date();
    const nowIso = now.toISOString();
    const today = nowIso.slice(0, 10);

    const { data: job } = await supabase
      .from("job_runs")
      .select("*")
      .eq("job_key", JOB_KEY)
      .maybeSingle();

    if (job?.paused) return { created: 0, skipped: "paused" as const };
    if (job?.lease_until && new Date(job.lease_until) > now) {
      return { created: 0, skipped: "locked" as const };
    }
    if (job?.last_ok_at && job.last_ok_at.slice(0, 10) === today) {
      return { created: 0, skipped: "already-ran-today" as const };
    }

    const leaseUntil = new Date(now.getTime() + LEASE_MINUTES * 60000).toISOString();
    await supabase
      .from("job_runs")
      .upsert({ job_key: JOB_KEY, lease_until: leaseUntil, last_run_at: nowIso }, { onConflict: "job_key" });

    let created = 0;
    try {
      const { data: clients } = await supabase
        .from("daily_lead_activations")
        .select("id, company_id, lead_name, employee_id, activation_date, potential_value")
        .not("lead_name", "is", null)
        .gt("potential_value", 0)
        .order("activation_date", { ascending: false })
        .limit(MAX_CLIENTS);

      const ids = (clients ?? []).map((c) => c.id);
      if (ids.length) {
        const [{ data: deposits }, { data: comms }] = await Promise.all([
          supabase.from("revenue").select("activation_id, date").in("activation_id", ids),
          supabase.from("client_communications").select("activation_id, occurred_at").in("activation_id", ids),
        ]);

        const lastTouch = new Map<string, string>();
        const note = (id: string | null, when: string | null) => {
          if (!id || !when) return;
          const d = when.slice(0, 10);
          if (!lastTouch.has(id) || lastTouch.get(id)! < d) lastTouch.set(id, d);
        };
        for (const r of deposits ?? []) note(r.activation_id, r.date);
        for (const c of comms ?? []) note(c.activation_id, c.occurred_at);

        const rows: Record<string, unknown>[] = [];
        for (const c of clients ?? []) {
          if (rows.length >= MAX_TASKS_PER_RUN) break;
          const since = lastTouch.get(c.id) ?? c.activation_date;
          if (!since) continue;
          const quiet = daysBetween(since, now);
          if (quiet < NEGLECT_WINDOW_DAYS) continue;
          rows.push({
            company_id: c.company_id,
            title: `Follow up with ${c.lead_name}`,
            notes: `No deposit or contact for ${quiet} days.`,
            due_date: today,
            priority: quiet >= NEGLECT_WINDOW_DAYS * 2 ? "high" : "normal",
            status: "open",
            activation_id: c.id,
            employee_id: c.employee_id,
            client_name: c.lead_name,
            auto_key: `neglect:${c.id}:${since}`,
          });
        }

        if (rows.length) {
          // The auto_key index is partial, so filter against existing keys
          // rather than relying on upsert conflict resolution.
          const keys = rows.map((r) => r.auto_key as string);
          const { data: existing } = await supabase.from("tasks").select("auto_key").in("auto_key", keys);
          const seen = new Set((existing ?? []).map((t) => t.auto_key));
          const fresh = rows.filter((r) => !seen.has(r.auto_key as string));
          if (fresh.length) {
            const { error } = await supabase.from("tasks").insert(fresh as never);
            if (error) throw error;
            created = fresh.length;
          }
        }
      }

      await supabase.from("job_runs").upsert(
        {
          job_key: JOB_KEY,
          lease_until: null,
          last_ok_at: new Date().toISOString(),
          last_error: null,
          processed_total: (job?.processed_total ?? 0) + created,
        },
        { onConflict: "job_key" },
      );
      return { created, skipped: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase
        .from("job_runs")
        .upsert({ job_key: JOB_KEY, lease_until: null, last_error: message }, { onConflict: "job_key" });
      throw new Error(message);
    }
  });
