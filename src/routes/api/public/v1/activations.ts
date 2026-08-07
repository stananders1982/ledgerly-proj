import { createFileRoute } from "@tanstack/react-router";

const PATH = "/api/public/v1/activations";

export const Route = createFileRoute("/api/public/v1/activations")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api-key.server")).corsPreflight(),

      GET: async ({ request }) => {
        const api = await import("@/lib/api-key.server");
        const auth = await api.authenticateApiKey(request, PATH, "read_leads");
        if (!auth.ok) return auth.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const url = new URL(request.url);
        const limit = api.clampLimit(url.searchParams.get("limit"));
        const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        let q = supabaseAdmin
          .from("daily_lead_activations")
          .select(
            "id, lead_name, activation_date, qualified_at, balance, potential, answered, employee_id, conversion_employee_id, tags, notes",
            { count: "exact" },
          )
          .eq("company_id", auth.key.companyId)
          .order("activation_date", { ascending: false })
          .range(offset, offset + limit - 1);
        if (api.isDate(from)) q = q.gte("activation_date", from);
        if (api.isDate(to)) q = q.lte("activation_date", to);

        const { data, count, error } = await q;
        if (error) return api.finish(auth.key, PATH, 500, { error: error.message });
        return api.finish(auth.key, PATH, 200, { data: data ?? [], total: count ?? 0, limit, offset });
      },
    },
  },
});
