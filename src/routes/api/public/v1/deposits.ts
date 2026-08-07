import { createFileRoute } from "@tanstack/react-router";

const PATH = "/api/public/v1/deposits";

export const Route = createFileRoute("/api/public/v1/deposits")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api-key.server")).corsPreflight(),

      POST: async ({ request }) => {
        const api = await import("@/lib/api-key.server");
        const auth = await api.authenticateApiKey(request, PATH, "write_deposits");
        if (!auth.ok) return auth.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: any;
        try {
          body = await request.json();
        } catch {
          return api.finish(auth.key, PATH, 400, { error: "Body must be valid JSON" });
        }

        const amount = Number(body?.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return api.finish(auth.key, PATH, 400, { error: "amount is required and must be a positive number" });
        }
        const date = api.isDate(body?.date) ? body.date : new Date().toISOString().slice(0, 10);

        // Resolve the client either by activation id or by name, company-scoped.
        let activationId: string | null = typeof body.activation_id === "string" ? body.activation_id : null;
        let customerName: string | null = typeof body.customer_name === "string" ? body.customer_name.trim() : null;

        if (activationId) {
          const { data: act } = await supabaseAdmin
            .from("daily_lead_activations")
            .select("id, lead_name")
            .eq("company_id", auth.key.companyId)
            .eq("id", activationId)
            .maybeSingle();
          if (!act) return api.finish(auth.key, PATH, 404, { error: "activation_id not found for this company" });
          customerName = customerName || act.lead_name || "Unknown";
        } else if (customerName) {
          const { data: act } = await supabaseAdmin
            .from("daily_lead_activations")
            .select("id")
            .eq("company_id", auth.key.companyId)
            .ilike("lead_name", customerName)
            .order("activation_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          activationId = act?.id ?? null;
        } else {
          return api.finish(auth.key, PATH, 400, { error: "customer_name or activation_id is required" });
        }

        const { data, error } = await supabaseAdmin
          .from("revenue")
          .insert({
            company_id: auth.key.companyId,
            customer_name: customerName!,
            activation_id: activationId,
            amount,
            date,
            method: typeof body.method === "string" ? body.method : null,
            method_provider: typeof body.method_provider === "string" ? body.method_provider : null,
            notes: typeof body.notes === "string" ? body.notes : null,
          })
          .select("id, customer_name, amount, date, activation_id, method, method_provider")
          .single();

        if (error) return api.finish(auth.key, PATH, 400, { error: error.message });
        return api.finish(auth.key, PATH, 201, { data });
      },
    },
  },
});
