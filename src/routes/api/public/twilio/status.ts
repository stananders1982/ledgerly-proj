import { createFileRoute } from "@tanstack/react-router";

/**
 * Twilio call-status callback. Writes the call outcome onto the client's
 * communication log and raises a follow-up task when the call failed.
 * Only URLs signed by this app are accepted.
 */
export const Route = createFileRoute("/api/public/twilio/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCallToken } = await import("@/lib/voip.server");
        const url = new URL(request.url);
        const to = url.searchParams.get("to") ?? "";
        const activation = url.searchParams.get("activation") ?? "";
        const token = url.searchParams.get("token");

        if (!verifyCallToken(`${to}|${activation}`, token)) {
          return new Response("Invalid signature", { status: 401 });
        }
        if (!activation) return new Response("ok");

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const status = String(form.get("CallStatus") ?? "");
        const duration = Number(form.get("CallDuration") ?? 0) || 0;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: client } = await supabaseAdmin
          .from("daily_lead_activations")
          .select("id, company_id, lead_name, employee_id")
          .eq("id", activation)
          .maybeSingle();
        if (!client) return new Response("ok");

        const answered = status === "completed" && duration > 0;
        await supabaseAdmin.from("client_communications").insert({
          company_id: client.company_id,
          activation_id: client.id,
          client_name: client.lead_name,
          channel: "call",
          direction: "outbound",
          summary: answered
            ? `Call connected — ${Math.round(duration / 60)}m ${duration % 60}s`
            : `Call not connected (${status || "unknown"})`,
        });

        if (!answered) {
          await supabaseAdmin.from("tasks").insert({
            company_id: client.company_id,
            title: `Retry call — ${client.lead_name ?? "client"}`,
            notes: `Automatic: the click-to-call attempt ended as "${status || "unknown"}".`,
            priority: "medium",
            status: "open",
            activation_id: client.id,
            employee_id: client.employee_id,
            client_name: client.lead_name,
            due_date: new Date().toISOString().slice(0, 10),
          });
        }

        return new Response("ok");
      },
    },
  },
});
