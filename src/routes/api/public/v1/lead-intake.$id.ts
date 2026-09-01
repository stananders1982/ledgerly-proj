import { createFileRoute } from "@tanstack/react-router";

const PATH = "/api/public/v1/lead-intake/$id";

/**
 * Minimal funnel status for a lead an affiliate pushed in.
 * Deliberately returns no money data and no personal detail beyond the name.
 */
export const Route = createFileRoute("/api/public/v1/lead-intake/$id")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api-key.server")).corsPreflight(),

      GET: async ({ request, params }) => {
        const api = await import("@/lib/api-key.server");
        const auth = await api.authenticateApiKey(request, PATH, "read_leads");
        if (!auth.ok) return auth.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const id = String(params.id ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return api.finish(auth.key, PATH, 400, { error: "Invalid lead id" });
        }

        let q = supabaseAdmin
          .from("leads")
          .select("id, name, status, activated, reported, created_at, affiliate_id")
          .eq("company_id", auth.key.companyId)
          .eq("id", id);
        // An affiliate-bound key can only ever see its own leads.
        if (auth.key.affiliateId) q = q.eq("affiliate_id", auth.key.affiliateId);

        const { data, error } = await q.maybeSingle();
        if (error) return api.finish(auth.key, PATH, 500, { error: error.message });
        if (!data) return api.finish(auth.key, PATH, 404, { error: "Lead not found" });

        const stage = data.status === "activated" || data.activated
          ? "activated"
          : data.status === "qualified"
            ? "converted"
            : "received";

        return api.finish(auth.key, PATH, 200, {
          data: { id: data.id, name: data.name, status: stage, received_at: data.created_at },
        });
      },
    },
  },
});
