import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const JOB_KEY = "client-automation";
const LEASE_MINUTES = 10;
const MAX_CLIENTS = 500;
const MAX_TASKS_PER_RUN = 100;
const NEGLECT_WINDOW_DAYS = 14;

const daysBetween = (a: string, b: Date) =>
  Math.floor((b.getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);

/**
 * Nightly client-care sweep: opens a follow-up task for every rated client who
 * has gone quiet, so nobody valuable is left without a next step.
 *
 * Called by the scheduler with the shared job secret. Bounded per run,
 * single-flight via a lease row, and idempotent through tasks.auto_key.
 */
export const Route = createFileRoute("/api/public/hooks/client-automation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["JOB_SECRET"];
        const provided = request.headers.get("x-job-secret");
        if (!secret || provided !== secret) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const supabase = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const now = new Date();
        const nowIso = now.toISOString();

        // Single-flight lease: a second run while one is in flight exits.
        const { data: job } = await supabase
          .from("job_runs")
          .select("*")
          .eq("job_key", JOB_KEY)
          .maybeSingle();

        if (job?.paused) {
          return Response.json({ skipped: "paused", reason: job.pause_reason });
        }
        if (job?.lease_until && new Date(job.lease_until) > now) {
          return Response.json({ skipped: "locked" });
        }

        const leaseUntil = new Date(now.getTime() + LEASE_MINUTES * 60000).toISOString();
        const { error: leaseErr } = await supabase.from("job_runs").upsert(
          { job_key: JOB_KEY, lease_until: leaseUntil, last_run_at: nowIso },
          { onConflict: "job_key" },
        );
        if (leaseErr) {
          return Response.json({ error: leaseErr.message }, { status: 500 });
        }

        let created = 0;
        try {
          const { data: clients } = await supabase
            .from("daily_lead_activations")
            .select("id, company_id, lead_name, employee_id, activation_date, potential_value, qualified_at")
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
                due_date: nowIso.slice(0, 10),
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
              // instead of relying on upsert conflict resolution.
              const { data: existing } = await supabase
                .from("tasks")
                .select("auto_key")
                .in("auto_key", rows.map((r) => r.auto_key as string));
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
          return Response.json({ ok: true, created });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          await supabase.from("job_runs").upsert(
            { job_key: JOB_KEY, lease_until: null, last_error: message },
            { onConflict: "job_key" },
          );
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
