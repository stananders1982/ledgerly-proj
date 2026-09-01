import { createServerFn } from "@tanstack/react-start";
import { TIER_LABEL, isNeglected, isWhale, valueTier, type TierThresholds } from "@/lib/whales";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { depositMatchesActivation, stdDepositsFor } from "@/lib/rules";
import { computeAffiliateBalances } from "@/lib/affiliate-balance";
import { computeRates, computeSalesSummary, type ClientStat, type SaleRow } from "@/lib/ask-stats";
import { getFxRates } from "@/lib/fx.functions";


/**
 * Natural-language question answering over the caller's own business data.
 *
 * The handler aggregates a compact snapshot through the *caller's* Supabase
 * client, so row-level rules decide what they can see, then asks the model to
 * answer from that snapshot only. No raw personal data leaves the server
 * beyond the names already visible to the asker.
 */
export const askBusinessQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    question: string;
    startIso?: string;
    endIso?: string;
    history?: { question: string; answer: string }[];
  }) => {
    const question = String(input?.question ?? "").trim();
    if (!question) throw new Error("Ask a question first.");
    if (question.length > 500) throw new Error("Question is too long.");
    const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : undefined);
    // Only the last few turns travel back, so "and last month?" resolves.
    const history = (Array.isArray(input?.history) ? input.history : [])
      .slice(-3)
      .map((h) => ({
        question: String(h?.question ?? "").slice(0, 500),
        answer: String(h?.answer ?? "").slice(0, 1200),
      }))
      .filter((h) => h.question && h.answer);
    return { question, startIso: day(input?.startIso), endIso: day(input?.endIso), history };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const supabase = context.supabase;
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    // Always keep 6 months of history for comparisons, but stretch back further
    // when the dashboard period starts earlier than that.
    const defaultSince = since.toISOString().slice(0, 10);
    const sinceIso = data.startIso && data.startIso < defaultSince ? data.startIso : defaultSince;
    const focusPeriod = data.startIso
      ? { start: data.startIso, end: data.endIso ?? new Date().toISOString().slice(0, 10) }
      : null;

    const [
      revenue, expenses, withdrawals, activations, leads, sources, employees, categories, affiliates,
      affTerms, allEntries, affPayments, settingsRow,
    ] =
      await Promise.all([
        supabase.from("revenue").select("date,amount,currency,customer_name,employee_id,employee_id_2,split_pct,affiliate_id,method,activation_id").gte("date", sinceIso),
        supabase.from("expenses").select("date,amount,currency,category_id").gte("date", sinceIso),
        supabase.from("withdrawals").select("date,amount,currency,employee_id,customer_name").gte("date", sinceIso),
        // Legacy (old CRM) clients are excluded from FTD/activation analysis.
        supabase.from("daily_lead_activations").select("id,lead_name,activation_date,qualified_at,employee_id,conversion_employee_id,entry_id,balance,potential,answered,status,age,date_of_birth,gender,country,city,language,occupation,next_follow_up,preferred_contact_time,tags,notes,ai_risk_score,ai_risk_label,ai_summary,potential_value,net_worth,liquid_funds,monthly_income,exposure_elsewhere,source_of_funds,deposit_appetite,ai_opportunity_score,ai_opportunity_label,ai_opportunity_reason,ai_suggested_potential").eq("legacy", false).gte("activation_date", sinceIso),
        supabase.from("daily_lead_entries").select("entry_date,received,activated,reported,cost,source_id").gte("entry_date", sinceIso),
        supabase.from("lead_sources").select("id,name,pricing_model,price"),
        // Use the same RLS-safe directory as the dashboard leaderboards. Some
        // non-admin roles cannot select `employees` directly, which previously
        // turned every activation into "unassigned" for Ask your data.
        supabase.rpc("list_employees_directory"),
        supabase.from("expense_categories").select("id,name"),
        // Revenue stores the source/affiliate id. Use the RLS-safe directory so
        // non-admin users can attribute deposits without exposing affiliate
        // contact or commercial fields.
        supabase.rpc("list_affiliates_directory"),
        // Affiliate balances: commercial terms, the full lead history since the
        // charging start date, and payments recorded as affiliate expenses.
        // Non-admin roles may not see these — balances are simply omitted then.
        supabase
          .from("affiliates")
          .select("id,name,active,cpa_rate,guarantee_value,group_key,balance_start_date,opening_balance,balance_activated_at"),
        supabase.from("daily_lead_entries").select("entry_date,received,invalid,reported,activated,source_id"),
        supabase.from("expenses").select("affiliate_id,date,amount").not("affiliate_id", "is", null),
        supabase.from("company_settings").select("currency,whale_threshold,high_threshold,mid_threshold,small_threshold").maybeSingle(),
      ]);

    const settingsData = (settingsRow as any)?.data ?? {};
    const whaleThreshold = Number(settingsData.whale_threshold) || 100000;
    const tierThresholds: TierThresholds = {
      whaleThreshold,
      highThreshold: Number(settingsData.high_threshold) || 50000,
      midThreshold: Number(settingsData.mid_threshold) || 15000,
      smallThreshold: Number(settingsData.small_threshold) || 1,
    };

    // Money is stored in the currency it was taken in; the recap must be in one
    // currency. Live rates, falling back to "no conversion" if the feed fails.
    const baseCurrency = String(settingsData.currency || "USD");
    let fxBaseRates: Record<string, number> = {};
    try {
      fxBaseRates = ((await getFxRates()) as any)?.baseRates ?? {};
    } catch {
      fxBaseRates = {};
    }
    const conv = (amount: unknown, currency?: string | null) => {
      const a = Number(amount) || 0;
      const c = currency || baseCurrency;
      if (c === baseCurrency) return a;
      const from = fxBaseRates[c];
      const to = fxBaseRates[baseCurrency];
      if (!from || !to) return a;
      return a * (to / from);
    };


    // Client-level CRM context: the notes the team leaves and the touches they log.
    const [clientComments, clientComms] = await Promise.all([
      supabase
        .from("record_comments")
        .select("entity_id,body,created_at")
        .eq("entity_type", "client")
        .order("created_at", { ascending: false })
        .limit(600),
      supabase
        .from("client_communications")
        .select("activation_id,channel,direction,summary,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(600),
    ]);

    // Running ledger balance per affiliate (positive = we owe them).
    const affiliateBalances = affTerms.error
      ? null
      : computeAffiliateBalances(
          (affTerms.data ?? []) as any[],
          ((sources.data ?? []) as any[]).map((s: any) => ({ id: s.id, name: s.name })),
          (allEntries.data ?? []) as any[],
          (affPayments.data ?? []) as any[],
        );


    const month = (d: string | null) => (d ?? "").slice(0, 7);
    const nameOf = (rows: any[] | null, id: string | null | undefined) =>
      rows?.find((r) => r.id === id)?.name ?? "unassigned";

    // Managers (Team M) are never part of agent-level metrics; they still
    // count inside company-wide totals.
    const managerIds = new Set(
      (employees.data ?? [])
        .filter((e: any) => String(e.team ?? "R").toUpperCase() === "M")
        .map((e: any) => e.id),
    );
    /** "" means "skip this row" — bucket() ignores empty keys. */
    const agentNameOf = (id: string | null | undefined) =>
      id && managerIds.has(id) ? "" : nameOf(employees.data, id);
    const agentKey = (m: string, id: string | null | undefined) => {
      const n = agentNameOf(id);
      return n ? `${m} | ${n}` : "";
    };

    const bucket = <T,>(rows: T[] | null, key: (r: T) => string, val: (r: T) => number) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) {
        const k = key(r);
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + val(r));
      }
      return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    };

    const round = (o: Record<string, number>) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));

    // Retention work uses the SAME rule as the app's performance page:
    // a client belongs to the retention agent on their activation row, the
    // activation balance is the FTD, and the first deposit on/after the
    // activation date (whenever it happens) is the STD.
    const actRows = (activations.data ?? []) as any[];
    const revRows = (revenue.data ?? []) as any[];
    const stdRows: { date: string; amount: number; agent: string }[] = [];
    const performanceRevenueRows: { date: string; amount: number; agent: string }[] = [];
    // Every deposit, split the same way, but keeping the client name and the
    // agent's team so "split X's month per client" can be answered exactly.
    const attributedRows: { date: string; amount: number; agent: string; client: string }[] = [];
    const employeeById = new Map((employees.data ?? []).map((employee: any) => [employee.id, employee]));

    // Match Employee Performance exactly: revenue is credited to the employees
    // selected on the deposit, respecting the configured split percentage.
    for (const row of revRows) {
      if (!row.date) continue;
      const amount = Number(row.amount || 0);
      const splitPct = Number(row.split_pct ?? 100);
      const client = String(row.customer_name || "Unnamed client");
      const primary = employeeById.get(row.employee_id) as any;
      const secondary = employeeById.get(row.employee_id_2) as any;
      if (primary?.name) {
        const share = amount * (splitPct / 100);
        attributedRows.push({ date: String(row.date), amount: share, agent: primary.name, client });
        if (String(primary.team ?? "R").toUpperCase() === "R") {
          performanceRevenueRows.push({ date: String(row.date), amount: share, agent: primary.name });
        }
      }
      if (secondary?.name) {
        const share = amount * ((100 - splitPct) / 100);
        attributedRows.push({ date: String(row.date), amount: share, agent: secondary.name, client });
        if (String(secondary.team ?? "R").toUpperCase() === "R") {
          performanceRevenueRows.push({ date: String(row.date), amount: share, agent: secondary.name });
        }
      }
      if (!primary?.name && !secondary?.name) {
        attributedRows.push({ date: String(row.date), amount, agent: "unassigned", client });
      }
    }

    for (const a of actRows) {
      const agent = agentNameOf(a.employee_id);
      if (!agent) continue;
      const mine = revRows.filter((r) => depositMatchesActivation(r, a));
      for (const s of stdDepositsFor(a, mine as any)) {
        stdRows.push({ date: String(s.date), amount: Number(s.amount || 0), agent });
      }
    }



    // ---- Client layer -------------------------------------------------
    // One compact record per client so the assistant can answer questions
    // about a named person. Capped so the payload stays small; the cap is
    // reported to the model so it never implies the list is exhaustive.
    const nameKeyOf = (n?: string | null) => (n ?? "").trim().toLowerCase();

    const depositsByClient = new Map<string, { total: number; count: number; last: string | null }>();
    const depositDatesByClient = new Map<string, string[]>();
    for (const r of revRows) {
      const key = r.activation_id ? `id:${r.activation_id}` : `name:${nameKeyOf(r.customer_name)}`;
      if (key === "name:") continue;
      const cur = depositsByClient.get(key) ?? { total: 0, count: 0, last: null };
      cur.total += Number(r.amount || 0);
      cur.count += 1;
      if (!cur.last || String(r.date) > cur.last) cur.last = String(r.date);
      depositsByClient.set(key, cur);
      const dates = depositDatesByClient.get(key) ?? [];
      dates.push(String(r.date));
      depositDatesByClient.set(key, dates);
    }

    const withdrawalsByClient = new Map<string, { total: number; count: number; last: string | null }>();
    for (const w of (withdrawals.data ?? []) as any[]) {
      const key = `name:${nameKeyOf(w.customer_name)}`;
      if (key === "name:") continue;
      const cur = withdrawalsByClient.get(key) ?? { total: 0, count: 0, last: null };
      cur.total += Number(w.amount || 0);
      cur.count += 1;
      if (!cur.last || String(w.date) > cur.last) cur.last = String(w.date);
      withdrawalsByClient.set(key, cur);
    }
    const commentsByClient = new Map<string, string[]>();
    for (const c of ((clientComments as any).data ?? []) as any[]) {
      const list = commentsByClient.get(c.entity_id) ?? [];
      if (list.length < 4) list.push(String(c.body ?? "").slice(0, 240));
      commentsByClient.set(c.entity_id, list);
    }
    const commsByClient = new Map<string, { at: string; channel: string; direction: string; summary: string | null }[]>();
    for (const c of ((clientComms as any).data ?? []) as any[]) {
      if (!c.activation_id) continue;
      const list = commsByClient.get(c.activation_id) ?? [];
      if (list.length < 4) {
        list.push({
          at: String(c.occurred_at).slice(0, 10),
          channel: c.channel,
          direction: c.direction,
          summary: c.summary ? String(c.summary).slice(0, 200) : null,
        });
      }
      commsByClient.set(c.activation_id, list);
    }

    const CLIENT_LIMIT = 250;
    const clientRecords = actRows.map((a: any) => {
      const dep = depositsByClient.get(`id:${a.id}`) ?? depositsByClient.get(`name:${nameKeyOf(a.lead_name)}`) ?? { total: 0, count: 0, last: null };
      const wd = withdrawalsByClient.get(`name:${nameKeyOf(a.lead_name)}`) ?? { total: 0, count: 0, last: null };
      const opening = Number(a.balance || 0);
      const comms = commsByClient.get(a.id) ?? [];
      return {
        name: a.lead_name ?? "Unnamed client",
        conversionAgent: nameOf(employees.data, a.conversion_employee_id),
        retentionAgent: nameOf(employees.data, a.employee_id),
        activationDate: a.activation_date ?? null,
        qualifiedAt: a.qualified_at ?? null,
        status: a.status ?? null,
        potential: a.potential ?? null,
        potentialValue: a.potential_value != null ? Number(a.potential_value) : null,
        isWhale: isWhale(a.potential_value, whaleThreshold),
        valueTier: TIER_LABEL[valueTier(a.potential_value, tierThresholds)],
        kyc: {
          netWorth: a.net_worth != null ? Number(a.net_worth) : null,
          liquidFunds: a.liquid_funds != null ? Number(a.liquid_funds) : null,
          monthlyIncome: a.monthly_income != null ? Number(a.monthly_income) : null,
          investedElsewhere: a.exposure_elsewhere != null ? Number(a.exposure_elsewhere) : null,
          sourceOfFunds: a.source_of_funds ?? null,
          depositAppetite: a.deposit_appetite != null ? Number(a.deposit_appetite) : null,
        },
        opportunityScore: a.ai_opportunity_score != null ? Number(a.ai_opportunity_score) : null,
        opportunityLabel: a.ai_opportunity_label ?? null,
        opportunityReason: a.ai_opportunity_reason ?? null,
        aiSuggestedPotential: a.ai_suggested_potential != null ? Number(a.ai_suggested_potential) : null,
        answered: !!a.answered,
        age: a.age ?? null,
        gender: a.gender ?? null,
        country: a.country ?? null,
        city: a.city ?? null,
        language: a.language ?? null,
        occupation: a.occupation ?? null,
        nextFollowUp: a.next_follow_up ?? null,
        tags: a.tags ?? [],
        notes: a.notes ? String(a.notes).slice(0, 300) : null,
        riskScore: a.ai_risk_score ?? null,
        riskLabel: a.ai_risk_label ?? null,
        openingBalance: Math.round(opening),
        depositTotal: Math.round(dep.total),
        depositCount: dep.count,
        lastDeposit: dep.last,
        withdrawalTotal: Math.round(wd.total),
        withdrawalCount: wd.count,
        lastWithdrawal: wd.last,
        balance: Math.round(opening + dep.total - wd.total),
        lastContact: comms[0]?.at ?? null,
        recentContacts: comms,
        recentComments: commentsByClient.get(a.id) ?? [],
        neglected: isNeglected({
          startDate: a.activation_date,
          depositDates: (depositDatesByClient.get(`id:${a.id}`) ?? depositDatesByClient.get(`name:${nameKeyOf(a.lead_name)}`) ?? []),
          contactDates: comms.map((c) => c.at),
        }),
      };
    });
    // Keep the clients that matter most: biggest money first, then most recent.
    const clientsRanked = [...clientRecords].sort((a, b) => {
      const av = Math.abs(a.depositTotal) + Math.abs(a.withdrawalTotal) + Math.abs(a.balance);
      const bv = Math.abs(b.depositTotal) + Math.abs(b.withdrawalTotal) + Math.abs(b.balance);
      if (bv !== av) return bv - av;
      return String(b.activationDate ?? "").localeCompare(String(a.activationDate ?? ""));
    });

    // ---- Rates and sales recap ----------------------------------------
    // Pre-computed so percentage and "summarize sales" questions are answered
    // from exact numbers instead of the model counting the client list.
    const todayIso = new Date().toISOString().slice(0, 10);
    const periodStart = focusPeriod?.start ?? sinceIso;
    const periodEnd = focusPeriod?.end ?? todayIso;
    const dayMs = 86_400_000;
    const spanDays = Math.max(
      1,
      Math.round((Date.parse(periodEnd) - Date.parse(periodStart)) / dayMs) + 1,
    );
    const prevEnd = new Date(Date.parse(periodStart) - dayMs).toISOString().slice(0, 10);
    const prevStart = new Date(Date.parse(periodStart) - spanDays * dayMs).toISOString().slice(0, 10);
    const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

    // Every deposit, converted, with the client's deposit ordinal (1 = FTD, 2 = STD).
    const depRowsByKey = new Map<string, (SaleRow & { key: string })[]>();
    for (const r of revRows) {
      const key = r.activation_id ? `id:${r.activation_id}` : `name:${nameKeyOf(r.customer_name)}`;
      if (key === "name:" || !r.date) continue;
      const list = depRowsByKey.get(key) ?? [];
      list.push({
        key,
        date: String(r.date),
        amount: conv(r.amount, r.currency),
        client: r.customer_name || "unknown",
        agent: nameOf(employees.data, r.employee_id),
        source: nameOf(affiliates.data, r.affiliate_id),
        method: r.method || "unspecified",
        currency: r.currency || baseCurrency,
        ordinal: 0,
      });
      depRowsByKey.set(key, list);
    }
    const saleRows: SaleRow[] = [];
    for (const list of depRowsByKey.values()) {
      list.sort((a, b) => a.date.localeCompare(b.date));
      list.forEach((d, i) => {
        d.ordinal = i + 1;
        saleRows.push(d);
      });
    }

    const withdrawalsConvByClient = new Map<string, { total: number; count: number }>();
    let withdrawalsInPeriod = 0;
    for (const w of (withdrawals.data ?? []) as any[]) {
      const amount = conv(w.amount, w.currency);
      if (w.date && inRange(String(w.date), periodStart, periodEnd)) withdrawalsInPeriod += amount;
      const key = nameKeyOf(w.customer_name);
      if (!key) continue;
      const cur = withdrawalsConvByClient.get(key) ?? { total: 0, count: 0 };
      cur.total += amount;
      cur.count += 1;
      withdrawalsConvByClient.set(key, cur);
    }
    const expensesInPeriod = ((expenses.data ?? []) as any[]).reduce(
      (s, e) => (e.date && inRange(String(e.date), periodStart, periodEnd) ? s + conv(e.amount, e.currency) : s),
      0,
    );

    const statOf = (a: any, from?: string, to?: string): ClientStat => {
      const key = depRowsByKey.has(`id:${a.id}`) ? `id:${a.id}` : `name:${nameKeyOf(a.lead_name)}`;
      const all = depRowsByKey.get(key) ?? [];
      const deps = from && to ? all.filter((d) => inRange(d.date, from, to)) : all;
      const wd = withdrawalsConvByClient.get(nameKeyOf(a.lead_name)) ?? { total: 0, count: 0 };
      const comms = commsByClient.get(a.id) ?? [];
      return {
        name: a.lead_name ?? "Unnamed client",
        tier: TIER_LABEL[valueTier(a.potential_value, tierThresholds)],
        country: a.country ?? null,
        conversionAgent: nameOf(employees.data, a.conversion_employee_id),
        retentionAgent: nameOf(employees.data, a.employee_id),
        depositCount: deps.length,
        depositTotal: deps.reduce((s, d) => s + d.amount, 0),
        withdrawalCount: wd.count,
        withdrawalTotal: wd.total,
        answered: !!a.answered,
        qualified: !!a.qualified_at,
        neglected: isNeglected({
          startDate: a.activation_date,
          depositDates: all.map((d) => d.date),
          contactDates: comms.map((c) => c.at),
        }),
        activationDate: a.activation_date ?? null,
      };
    };

    const windowStats = actRows.map((a) => statOf(a));
    const periodClients = actRows.filter(
      (a: any) => a.activation_date && inRange(String(a.activation_date), periodStart, periodEnd),
    );
    const periodStats = periodClients.map((a) => statOf(a, periodStart, periodEnd));

    const rates = {
      window: computeRates(windowStats, `all clients since ${sinceIso} (lifetime deposits)`),
      selectedPeriod: computeRates(
        periodStats,
        `clients activated ${periodStart} to ${periodEnd} (deposits inside that period)`,
      ),
    };

    const salesSummary = computeSalesSummary({
      label: focusPeriod ? "selected dashboard period" : "last 6 months",
      start: periodStart,
      end: periodEnd,
      rows: saleRows.filter((r) => inRange(r.date, periodStart, periodEnd)),
      previousRows: saleRows.filter((r) => inRange(r.date, prevStart, prevEnd)),
      previousLabel: `${prevStart} to ${prevEnd}`,
      withdrawals: withdrawalsInPeriod,
      expenses: expensesInPeriod,
      monthlyRows: saleRows,
    });

    const snapshot = {
      whaleThreshold,
      tierThresholds,
      today: todayIso,
      window: `${sinceIso} to today`,
      selectedPeriod: focusPeriod,
      currency: baseCurrency,
      rates,
      salesSummary,
      monthly: {
        deposits: round(bucket(revenue.data, (r: any) => month(r.date), (r: any) => Number(r.amount || 0))),
        expenses: round(bucket(expenses.data, (r: any) => month(r.date), (r: any) => Number(r.amount || 0))),
        withdrawals: round(bucket(withdrawals.data, (r: any) => month(r.date), (r: any) => Number(r.amount || 0))),
        activations: bucket(activations.data, (a: any) => month(a.activation_date), () => 1),
        leadsReceived: bucket(leads.data, (l: any) => month(l.entry_date), (l: any) => Number(l.received || 0)),
      },
      bySource: round(
        bucket(leads.data, (l: any) => nameOf(sources.data, l.source_id), (l: any) => Number(l.received || 0)),
      ),
      sourceCost: round(
        bucket(leads.data, (l: any) => nameOf(sources.data, l.source_id), (l: any) => Number(l.cost || 0)),
      ),
      depositsByAgent: round(
        bucket(revenue.data, (r: any) => agentNameOf(r.employee_id), (r: any) => Number(r.amount || 0)),
      ),
      // "month | agent" keys so month-specific agent questions are answerable.
      depositsByMonthAndAgent: round(
        bucket(
          revenue.data,
          (r: any) => agentKey(month(r.date), r.employee_id),
          (r: any) => Number(r.amount || 0),
        ),
      ),
      activationsByConversionAgent: bucket(
        activations.data,
        (a: any) => agentNameOf(a.conversion_employee_id),
        () => 1,
      ),
      // Activation clock: counted in the month the lead was activated.
      activationsByMonthActivatedAndAgent: bucket(
        activations.data,
        (a: any) => agentKey(month(a.activation_date), a.conversion_employee_id),
        () => 1,
      ),
      // Qualification clock: counted in the month the FTD became valid. This
      // includes leads activated in earlier months, so it is normally larger
      // than the activation count for the same month — they are not subsets.
      qualifiedFtdsByMonthQualifiedAndAgent: bucket(
        (activations.data ?? []).filter((a: any) => a.qualified_at),
        (a: any) => agentKey(month(a.qualified_at), a.conversion_employee_id),
        () => 1,
      ),
      // Of those qualified in a month, how many were activated in an earlier month.
      qualifiedFromEarlierMonthsByMonthAndAgent: bucket(
        (activations.data ?? []).filter(
          (a: any) => a.qualified_at && month(a.qualified_at) !== month(a.activation_date),
        ),
        (a: any) => agentKey(month(a.qualified_at), a.conversion_employee_id),
        () => 1,
      ),
      // Of a month's own activations, how many qualified within that same month.
      qualifiedSameMonthByMonthAndAgent: bucket(
        (activations.data ?? []).filter(
          (a: any) => a.qualified_at && month(a.qualified_at) === month(a.activation_date),
        ),
        (a: any) => agentKey(month(a.activation_date), a.conversion_employee_id),
        () => 1,
      ),

      depositsByMonthAndSource: round(
        bucket(
          revenue.data,
          (r: any) => `${month(r.date)} | ${nameOf(affiliates.data, r.affiliate_id)}`,
          (r: any) => Number(r.amount || 0),
        ),
      ),
      leadsByMonthAndSource: round(
        bucket(
          leads.data,
          (l: any) => `${month(l.entry_date)} | ${nameOf(sources.data, l.source_id)}`,
          (l: any) => Number(l.received || 0),
        ),
      ),
      expensesByCategory: round(
        bucket(expenses.data, (e: any) => nameOf(categories.data, e.category_id), (e: any) => Number(e.amount || 0)),
      ),
      expensesByMonthAndCategory: round(
        bucket(
          expenses.data,
          (e: any) => `${month(e.date)} | ${nameOf(categories.data, e.category_id)}`,
          (e: any) => Number(e.amount || 0),
        ),
      ),
      depositsByMethod: round(
        bucket(revenue.data, (r: any) => r.method || "unspecified", (r: any) => Number(r.amount || 0)),
      ),
      employeeTeams: Object.fromEntries(
        (employees.data ?? [])
          .filter((e: any) => !managerIds.has(e.id))
          .map((e: any) => [e.name, e.team ?? "—"]),
      ),
      // Retention: deposits on clients assigned to a retention agent, credited
      // to that agent. Keys are "month | agent".
      retentionDepositsByMonthAndAgent: round(
        bucket(performanceRevenueRows, (r) => `${month(r.date)} | ${r.agent}`, (r) => r.amount),
      ),
      retentionDepositCountByMonthAndAgent: bucket(
        performanceRevenueRows,
        (r) => `${month(r.date)} | ${r.agent}`,
        () => 1,
      ),
      // STDs exactly as the app counts them (the client's second deposit,
      // whenever it happens after activation). This is the retention scoreboard.
      stdCountByMonthAndAgent: bucket(stdRows, (r) => `${month(r.date)} | ${r.agent}`, () => 1),
      stdAmountByMonthAndAgent: round(
        bucket(stdRows, (r) => `${month(r.date)} | ${r.agent}`, (r) => r.amount),
      ),

      // Affiliate running balances (whole ledger since each charging start
      // date). Positive = we owe the affiliate, negative = we hold credit.
      // null when the caller is not allowed to see affiliate terms.
      affiliateBalances: affiliateBalances
        ? Object.fromEntries(
            affiliateBalances.map((b) => [b.name, Math.round(b.balance)]),
          )
        : null,

      // Every client the caller can see in this window, richest context first.
      clients: clientsRanked.slice(0, CLIENT_LIMIT),
      clientCount: clientRecords.length,
      clientsTruncated: clientRecords.length > CLIENT_LIMIT,
      // Slim row for EVERY client, so no question needs the truncated rich list.
      clientDirectory: clientRecords.map((c) => ({
        n: c.name,
        c: c.conversionAgent,
        r: c.retentionAgent,
        a: c.activationDate,
        s: c.status,
        d: c.depositTotal,
        k: c.depositCount,
        l: c.lastDeposit,
        w: c.withdrawalTotal,
        b: c.balance,
        t: c.valueTier,
      })),
      // Exact per-deposit attribution: "YYYY-MM | agent | client" -> amount,
      // plus the matching deposit counts. Splits already applied.
      depositsByMonthAgentAndClient: round(
        bucket(attributedRows, (r) => `${month(r.date)} | ${r.agent} | ${r.client}`, (r) => r.amount),
      ),
      depositCountByMonthAgentAndClient: bucket(
        attributedRows,
        (r) => `${month(r.date)} | ${r.agent} | ${r.client}`,
        () => 1,
      ),
      // Same, without the agent dimension: "YYYY-MM | client" -> amount.
      depositsByMonthAndClient: round(
        bucket(revRows, (r: any) => (r.date ? `${month(String(r.date))} | ${r.customer_name || "Unnamed client"}` : ""), (r: any) => Number(r.amount || 0)),
      ),

      withdrawalsByClient: round(
        Object.fromEntries(
          [...withdrawalsByClient.entries()].map(([k, v]) => [k.replace(/^name:/, ""), v.total]),
        ),
      ),
      withdrawalsByMonthAndAgent: round(
        bucket(
          withdrawals.data,
          (w: any) => agentKey(month(w.date), w.employee_id),
          (w: any) => Number(w.amount || 0),
        ),
      ),

      totals: {
        deposits: Math.round((revenue.data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)),
        expenses: Math.round((expenses.data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)),
        withdrawals: Math.round((withdrawals.data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)),
        activations: (activations.data ?? []).length,
        qualifiedFtds: (activations.data ?? []).filter((a: any) => a.qualified_at).length,
        leadsReceived: (leads.data ?? []).reduce((s: number, l: any) => s + Number(l.received || 0), 0),
      },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text:
              "You answer questions about a lead-generation and client-deposit business using ONLY the JSON snapshot provided. " +
              "Answer length: one or two sentences with the concrete numbers for a single-number question; when the question asks to " +
              "summarize, recap or report, answer with a short headline sentence plus up to six '- ' bullets. " +
              "All amounts are already converted to snapshot.currency. " +
              "When snapshot.selectedPeriod is not null, the user is looking at that dashboard period: answer about it by default " +
               "unless the question names a different period, and say which dates you used. " +
              "FTD means first-time deposit (an activated client); STD means a second deposit. " +
              "DEFAULT RULE: 'FTDs', 'activations', 'conversions' and 'how many clients' always mean the ACTIVATION clock — " +
              "leads activated in that period, from activationsByMonthActivatedAndAgent / totals.activations. " +
              "For those questions answer with the activation number only; do NOT mention qualified FTDs, the qualification clock, " +
              "or the earlier-months backlog at all. " +
              "Use the qualification clock (qualifiedFtdsByMonthQualifiedAndAgent) ONLY when the question is about commission, payouts, " +
              "or explicitly says qualified/valid FTDs, or explicitly asks for both clocks. In that case name each clock, and you may use " +
              "qualifiedFromEarlierMonthsByMonthAndAgent (carried over from earlier months) and qualifiedSameMonthByMonthAndAgent " +
              "(that month's own activations which already qualified) to explain the make-up. " +
              "TEAMS: employeeTeams maps each agent to C (conversion), R (retention) or M (manager). " +
              "A question about retention concerns ONLY team R agents. Rank retention leaders by their MONTHLY REVENUE — " +
              "retentionDepositsByMonthAndAgent, which is the revenue shown for that agent on the Employee Performance page " +
              "(deposit revenue attributed to that employee, with split percentages applied). Highest revenue is the leader. " +
              "stdCountByMonthAndAgent / stdAmountByMonthAndAgent are the STD counts; mention them only as extra colour or when the " +
              "question asks about STDs, never as the ranking. " +
              "Do not rank retention by depositsByMonthAndAgent (deposits credited to whoever recorded them). " +
              "A question about conversion concerns ONLY team C agents. Exclude managers from agent rankings. " +
              "For 'who is leading', rank by activations by default; rank by qualified FTDs only when the question is about commission or pay, and say so. " +

              "AFFILIATE BALANCES: affiliateBalances is each affiliate's (or billing group's) running ledger balance in USD — " +
              "positive means we owe the affiliate, negative means we are in credit with them. Balances are lifetime running " +
              "figures since each affiliate's charging start date, not limited to the selected period. Affiliates whose charging " +
              "has not been activated are not listed. If affiliateBalances is null, say balances are not visible to this user. " +
              "VALUE TIERS: each client has valueTier (Whale / High / Mid / Small / Unrated) derived from potentialValue against " +
              "snapshot.tierThresholds — Whale is the top band. Unrated means no potential value was filled in. " +
              "neglected means the client neither deposited nor was contacted in the 14 days after activation; a neglected client " +
              "in a high tier is the most urgent kind. HEADROOM: opportunityScore (0-100) with opportunityLabel and " +
              "opportunityReason is the AI read of how much MORE money we can realistically take, judged from the kyc block " +
              "(netWorth, liquidFunds, monthlyIncome, investedElsewhere, sourceOfFunds, depositAppetite 1-5) and the notes/calls; " +
              "aiSuggestedPotential is its own estimate of lifetime deposit capacity. " +
              "CLIENTS: snapshot.clientDirectory is the COMPLETE list of every client (one slim row each): n=name, c=conversion agent, " +
              "r=retention agent, a=activation date, s=status, d=lifetime deposit total, k=deposit count, l=last deposit date, " +
              "w=withdrawal total, b=balance, t=value tier. Use it for any list, count, or lookup that must cover everyone, and for " +
              "answering questions about a named client. snapshot.clients adds richer context for a subset of clients — " +
              "name, both agents, activation and qualification dates, CRM status, potential, age/country/language/occupation, tags, " +
              "team notes, the latest logged calls/messages (recentContacts), the latest team comments (recentComments), openingBalance, " +
              "depositTotal/Count, lastDeposit, withdrawalTotal/Count, lastWithdrawal, current balance and any stored AI riskScore/riskLabel " +
              "(0-100, higher = needs attention). Use snapshot.clients only for deep per-client colour after identifying the client(s) " +
              "from clientDirectory; NEVER use it as the source of truth for period amounts, counts, or per-client splits. " +
              "NEVER say the client data is truncated or incomplete. Compare dates against snapshot.today. " +
              "PER-CLIENT MONTHLY SPLITS: for 'X's deposits for <month> split per client', or any per-client amount inside a period, " +
              "use depositsByMonthAgentAndClient — keys are 'YYYY-MM | agent | client' with the exact attributed amount (splits " +
              "already applied) — and depositCountByMonthAgentAndClient for the number of deposits. depositsByMonthAndClient " +
              "('YYYY-MM | client') is the same without agent attribution. These are authoritative: sum the matching keys, list every " +
              "client with a non-zero amount, and never fall back to lifetime depositTotal or lastDeposit for a period question. " +
              "The per-client amounts for an agent and month always add up to that agent's monthly total. " +

              "PERCENTAGES: snapshot.rates already holds every client ratio — use those numbers verbatim and NEVER recount the client " +
              "list. rates.selectedPeriod covers clients activated inside the selected period (deposits counted inside it); " +
              "rates.window covers all clients in the 6-month window with lifetime deposits. Each block has depositRatePct " +
              "(clients who deposited at least once), stdRatePct and stdRateOfDepositorsPct (second deposit), repeatRatePct (3+), " +
              "answeredRatePct, qualifiedRatePct, neglectedRatePct, withdrawalRatePct, average/median deposit per depositing client, " +
              "and byTier / byCountry / byConversionAgent / byRetentionAgent breakdowns. Always state the denominator, " +
              "e.g. '62 of 210 clients = 29.5%'. " +
              "SALES SUMMARY: for 'summarize sales', revenue recaps or 'how did we do', use snapshot.salesSummary — totalDeposits, " +
              "depositCount, uniqueDepositingClients, averageTicket, largestDeposit, newMoney (first deposits) vs secondDeposits vs " +
              "returningMoney, previousPeriod change, bestMonth/worstMonth, topAgents, topSources, topClients, byMethod, " +
              "byOriginalCurrency and netAfterWithdrawalsAndExpenses. Quote its dates. " +
              "If the snapshot does not contain the answer, say exactly what is missing instead of guessing." }],


          },
          ...data.history.flatMap((h) => [
            { role: "user", content: [{ type: "input_text", text: h.question }] },
            { role: "assistant", content: [{ type: "output_text", text: h.answer }] },
          ]),
          { role: "user", content: [{ type: "input_text", text: `Snapshot:\n${JSON.stringify(snapshot)}\n\nQuestion: ${data.question}` }] },
        ],
      }),
    });

    if (res.status === 429) throw new Error("AI is rate limited right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    if (!res.ok) throw new Error(`AI request failed (${res.status}).`);

    const json = (await res.json()) as any;
    const answer = String(
      json?.output_text ??
      json?.output?.flatMap((item: any) => item?.content ?? []).find((item: any) => item?.type === "output_text")?.text ??
      "",
    ).trim();
    return { answer: answer || "No answer came back — try rephrasing the question." };
  });
