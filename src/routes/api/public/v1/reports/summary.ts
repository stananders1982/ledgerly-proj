import { createFileRoute } from "@tanstack/react-router";

const PATH = "/api/public/v1/reports/summary";

export const Route = createFileRoute("/api/public/v1/reports/summary")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api-key.server")).corsPreflight(),

      GET: async ({ request }) => {
        const api = await import("@/lib/api-key.server");
        const auth = await api.authenticateApiKey(request, PATH, "read_reports");
        if (!auth.ok) return auth.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const url = new URL(request.url);
        const today = new Date();
        const defFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const defTo = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
        const from = api.isDate(url.searchParams.get("from")) ? url.searchParams.get("from")! : defFrom;
        const to = api.isDate(url.searchParams.get("to")) ? url.searchParams.get("to")! : defTo;
        const cid = auth.key.companyId;

        const [rev, wd, exp, entries, acts] = await Promise.all([
          supabaseAdmin.from("revenue").select("amount, date").eq("company_id", cid).gte("date", from).lte("date", to),
          supabaseAdmin.from("withdrawals").select("amount, date").eq("company_id", cid).gte("date", from).lte("date", to),
          supabaseAdmin.from("expenses").select("amount, date").eq("company_id", cid).gte("date", from).lte("date", to),
          supabaseAdmin
            .from("daily_lead_entries")
            .select("received, activated, reported, cost, entry_date")
            .eq("company_id", cid)
            .gte("entry_date", from)
            .lte("entry_date", to),
          supabaseAdmin
            .from("daily_lead_activations")
            .select("id, qualified_at, activation_date")
            .eq("company_id", cid)
            .eq("legacy", false)
            .gte("activation_date", from)
            .lte("activation_date", to),
        ]);

        const err = rev.error || wd.error || exp.error || entries.error || acts.error;
        if (err) return api.finish(auth.key, PATH, 500, { error: err.message });

        const sum = (rows: any[] | null, k: string) => (rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);
        const grossRevenue = sum(rev.data, "amount");
        const withdrawals = sum(wd.data, "amount");
        const expenses = sum(exp.data, "amount");
        const leadCost = sum(entries.data, "cost");
        const netRevenue = grossRevenue - withdrawals;
        const totalCosts = expenses + leadCost;

        return api.finish(auth.key, PATH, 200, {
          period: { from, to },
          revenue: {
            gross: grossRevenue,
            withdrawals,
            net: netRevenue,
            deposits_count: (rev.data ?? []).length,
          },
          costs: { expenses, lead_cost: leadCost, total: totalCosts },
          leads: {
            received: sum(entries.data, "received"),
            activated: sum(entries.data, "activated"),
            reported: sum(entries.data, "reported"),
          },
          activations: {
            total: (acts.data ?? []).length,
            qualified: (acts.data ?? []).filter((a: any) => a.qualified_at).length,
          },
          net_profit: netRevenue - totalCosts,
        });
      },
    },
  },
});
