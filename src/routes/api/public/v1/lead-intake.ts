import { createFileRoute } from "@tanstack/react-router";

const PATH = "/api/public/v1/lead-intake";

/**
 * Individual lead intake for affiliates.
 *
 * An affiliate pushes one lead per call with their own API key. The key is
 * bound to a single affiliate, so nothing they send can land on another
 * affiliate's books.
 */
export const Route = createFileRoute("/api/public/v1/lead-intake")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api-key.server")).corsPreflight(),

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

        const str = (v: unknown, max = 200) =>
          typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

        const name = str(body?.name ?? body?.full_name);
        const phone = str(body?.phone, 40);
        const email = str(body?.email, 200);
        if (!name) return api.finish(auth.key, PATH, 400, { error: "name is required" });
        if (!phone && !email) return api.finish(auth.key, PATH, 400, { error: "phone or email is required" });
        if (email && !email.includes("@")) return api.finish(auth.key, PATH, 400, { error: "email is not valid" });

        // Resolve the affiliate: the key's binding wins, always.
        let affiliateId = auth.key.affiliateId;
        if (!affiliateId && typeof body?.affiliate === "string" && body.affiliate.trim()) {
          const { data: aff } = await supabaseAdmin
            .from("affiliates")
            .select("id")
            .eq("company_id", auth.key.companyId)
            .ilike("name", body.affiliate.trim())
            .maybeSingle();
          affiliateId = aff?.id ?? null;
        }

        // Optional source, by id or name, scoped to the key's company.
        let sourceId: string | null = str(body?.source_id, 60);
        if (!sourceId && typeof body?.source === "string" && body.source.trim()) {
          const { data: src } = await supabaseAdmin
            .from("lead_sources")
            .select("id")
            .eq("company_id", auth.key.companyId)
            .ilike("name", body.source.trim())
            .maybeSingle();
          sourceId = src?.id ?? null;
        }

        const notes = [str(body?.notes, 1000), body?.sub_id ? `sub_id: ${str(body.sub_id, 80)}` : null, body?.country ? `country: ${str(body.country, 60)}` : null]
          .filter(Boolean)
          .join(" · ") || null;

        const { data, error } = await supabaseAdmin
          .from("leads")
          .insert({
            company_id: auth.key.companyId,
            name,
            phone,
            email,
            affiliate_id: affiliateId,
            source_id: sourceId,
            status: "new",
            notes,
          })
          .select("id, name, status, created_at")
          .single();

        if (error) {
          const duplicate = /already exists/i.test(error.message);
          return api.finish(auth.key, PATH, duplicate ? 409 : 400, { error: error.message });
        }

        return api.finish(auth.key, PATH, 201, {
          data: { id: data.id, name: data.name, status: "received", received_at: data.created_at },
        });
      },
    },
  },
});
