import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFxRates } from "@/lib/fx.server";
import { startOfDay, endOfDay, subDays } from "date-fns";
import type { ScenarioBaseline } from "@/lib/scenario";

const SUPPORTED = ["USD", "EUR", "GBP", "AUD", "NZD"] as const;

const toIso = (d: Date) => d.toISOString().split("T")[0];

/**
 * Reads the real funnel for a period so scenarios start from actuals,
 * not guesses. All money is normalised to USD (display layer converts).
 */
export const getScenarioBaseline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { start?: string; end?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<ScenarioBaseline> => {
    const { data: cid, error: cidErr } = await context.supabase.rpc("current_company_id");
    if (cidErr) throw cidErr;

    const today = new Date();
    const start = toIso(data.start ? new Date(data.start) : startOfDay(subDays(today, 90)));
    const end = toIso(data.end ? new Date(data.end) : endOfDay(today));

    const fx = await loadFxRates();
    const baseRates = fx.baseRates;
    const settingsRes = await context.supabase
      .from("company_settings").select("currency").eq("company_id", cid).maybeSingle();
    const workspace = settingsRes.data?.currency ?? "USD";

    const rate = (ccy: string | null | undefined) => {
      const c = (ccy ?? workspace) as (typeof SUPPORTED)[number];
      const from = baseRates[c];
      const usd = baseRates["USD"];
      return from && usd ? usd / from : 1;
    };
    const usd = (amount: unknown, ccy?: string | null) => (Number(amount) || 0) * rate(ccy ?? null);

    const [entriesRes, activationsRes, revenueRes, expensesRes, withdrawalsRes, sourcesRes] = await Promise.all([
      context.supabase
        .from("daily_lead_entries").select("received, activated, cost, entry_date, source_id")
        .eq("company_id", cid).gte("entry_date", start).lte("entry_date", end),
      context.supabase
        .from("daily_lead_activations").select("id, activation_date, qualified_at")
        .eq("company_id", cid).eq("legacy", false)
        .gte("activation_date", start).lte("activation_date", end),
      context.supabase
        .from("revenue").select("amount, currency, date")
        .eq("company_id", cid).gte("date", start).lte("date", end),
      context.supabase
        .from("expenses").select("amount, currency, date")
        .eq("company_id", cid).gte("date", start).lte("date", end),
      context.supabase
        .from("withdrawals").select("amount, currency, date")
        .eq("company_id", cid).gte("date", start).lte("date", end),
      ,
      context.supabase.from("lead_sources").select("id, pricing_model, price").eq("company_id", cid),
    ]);

    const entries = (entriesRes.data ?? []) as any[];
    const activationRows = (activationsRes.data ?? []) as any[];
    const revenueRows = (revenueRes.data ?? []) as any[];
    const expenseRows = (expensesRes.data ?? []) as any[];
    const withdrawalRows = (withdrawalsRes.data ?? []) as any[];

    const leads = entries.reduce((s, e) => s + (Number(e.received) || 0), 0);
    // Entries often leave `cost` blank; fall back to the source's price card
    // so cost-per-lead is still a real number to model against.
    const sourceMap = new Map(((sourcesRes.data ?? []) as any[]).map((s) => [s.id, s]));
    const acquisitionCost = entries.reduce((sum, e) => {
      const explicit = usd(e.cost, null);
      if (explicit) return sum + explicit;
      const src = sourceMap.get(e.source_id ?? "");
      if (!src) return sum;
      const units = src.pricing_model === "CPA" ? Number(e.activated) || 0 : Number(e.received) || 0;
      return sum + usd(units * (Number(src.price) || 0), null);
    }, 0);
    const activations = activationRows.length;
    const ftds = activationRows.filter((a) => !!a.qualified_at).length;
    const revenue = revenueRows.reduce((s, r) => s + usd(r.amount, r.currency), 0);
    const fixedCosts = expenseRows.reduce((s, r) => s + usd(r.amount, r.currency), 0);
    const withdrawals = withdrawalRows.reduce((s, r) => s + usd(r.amount, r.currency), 0);

    return {
      leads,
      cpl: leads ? acquisitionCost / leads : 0,
      activationRate: leads ? activations / leads : 0,
      ftdRate: activations ? ftds / activations : 0,
      avgFtd: ftds ? revenue / ftds : 0,
      revenue,
      acquisitionCost,
      fixedCosts,
      withdrawals,
      activations,
      ftds,
      currency: "USD",
      start,
      end,
    };
  });
