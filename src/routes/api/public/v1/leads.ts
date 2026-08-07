import { createFileRoute } from "@tanstack/react-router";

const PATH = "/api/public/v1/leads";

export const Route = createFileRoute("/api/public/v1/leads")({
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
          .from("daily_lead_entries")
          .select("id, entry_date, source_id, campaign, received, activated, reported, converted, cost, notes", { count: "exact" })
          .eq("company_id", auth.key.companyId)
          .order("entry_date", { ascending: false })
          .range(offset, offset + limit - 1);
        if (api.isDate(from)) q = q.gte("entry_date", from);
        if (api.isDate(to)) q = q.lte("entry_date", to);

        const { data, count, error } = await q;
        if (error) return api.finish(auth.key, PATH, 500, { error: error.message });
        return api.finish(auth.key, PATH, 200, { data: data ?? [], total: count ?? 0, limit, offset });
      },

      POST: async ({ request }) => {
        const api = await import("@/lib/api-key.server");
        const auth = await api.authenticateApiKey(request, PATH, "write_leads");
        if (!auth.ok) return auth.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: any;
        try {
          body = await request.json();
        } catch {
          return api.finish(auth.key, PATH, 400, { error: "Body must be valid JSON" });
        }

        if (!api.isDate(body?.entry_date)) {
          return api.finish(auth.key, PATH, 400, { error: "entry_date is required (YYYY-MM-DD)" });
        }
        const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

        // Optional source lookup by name, scoped to this key's company.
        let sourceId: string | null = typeof body.source_id === "string" ? body.source_id : null;
        if (!sourceId && typeof body.source === "string" && body.source.trim()) {
          const { data: src } = await supabaseAdmin
            .from("lead_sources")
            .select("id")
            .eq("company_id", auth.key.companyId)
            .ilike("name", body.source.trim())
            .maybeSingle();
          sourceId = src?.id ?? null;
        }

        const { data, error } = await supabaseAdmin
          .from("daily_lead_entries")
          .insert({
            company_id: auth.key.companyId,
            entry_date: body.entry_date,
            source_id: sourceId,
            campaign: typeof body.campaign === "string" ? body.campaign : null,
            received: num(body.received),
            activated: num(body.activated),
            reported: num(body.reported),
            converted: num(body.converted),
            cost: num(body.cost),
            notes: typeof body.notes === "string" ? body.notes : null,
          })
          .select("id, entry_date, received, activated, reported, converted, cost")
          .single();

        if (error) return api.finish(auth.key, PATH, 400, { error: error.message });
        return api.finish(auth.key, PATH, 201, { data });
      },
    },
  },
});
