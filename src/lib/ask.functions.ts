import { createServerFn } from "@tanstack/react-start";
import { isNeglectedWhale, isWhale } from "@/lib/whales";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { depositMatchesActivation, stdDepositsFor } from "@/lib/rules";
import { computeAffiliateBalances } from "@/lib/affiliate-balance";


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
  .inputValidator((input: { question: string; startIso?: string; endIso?: string }) => {
    const question = String(input?.question ?? "").trim();
    if (!question) throw new Error("Ask a question first.");
    if (question.length > 500) throw new Error("Question is too long.");
    const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : undefined);
    return { question, startIso: day(input?.startIso), endIso: day(input?.endIso) };
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
        supabase.from("revenue").select("date,amount,customer_name,employee_id,employee_id_2,split_pct,affiliate_id,method,activation_id").gte("date", sinceIso),
        supabase.from("expenses").select("date,amount,category_id").gte("date", sinceIso),
        supabase.from("withdrawals").select("date,amount,employee_id,customer_name").gte("date", sinceIso),
        // Legacy (old CRM) clients are excluded from FTD/activation analysis.
        supabase.from("daily_lead_activations").select("id,lead_name,activation_date,qualified_at,employee_id,conversion_employee_id,entry_id,balance,potential,answered,status,age,date_of_birth,gender,country,city,language,occupation,next_follow_up,preferred_contact_time,tags,notes,ai_risk_score,ai_risk_label,ai_summary,potential_value").eq("legacy", false).gte("activation_date", sinceIso),
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
        supabase.from("company_settings").select("whale_threshold").maybeSingle(),
      ]);

    const whaleThreshold = Number((settingsRow as any)?.data?.whale_threshold) || 100000;

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
    // activation date (same calendar month) is the STD.
    const actRows = (activations.data ?? []) as any[];
    const revRows = (revenue.data ?? []) as any[];
    const stdRows: { date: string; amount: number; agent: string }[] = [];
    const performanceRevenueRows: { date: string; amount: number; agent: string }[] = [];
    const employeeById = new Map((employees.data ?? []).map((employee: any) => [employee.id, employee]));

    // Match Employee Performance exactly: revenue is credited to the employees
    // selected on the deposit, respecting the configured split percentage.
    for (const row of revRows) {
      if (!row.date) continue;
      const amount = Number(row.amount || 0);
      const splitPct = Number(row.split_pct ?? 100);
      const primary = employeeById.get(row.employee_id) as any;
      const secondary = employeeById.get(row.employee_id_2) as any;
      if (primary?.name && String(primary.team ?? "R").toUpperCase() === "R") {
        performanceRevenueRows.push({ date: String(row.date), amount: amount * (splitPct / 100), agent: primary.name });
      }
      if (secondary?.name && String(secondary.team ?? "R").toUpperCase() === "R") {
        performanceRevenueRows.push({ date: String(row.date), amount: amount * ((100 - splitPct) / 100), agent: secondary.name });
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
    for (const r of revRows) {
      const key = r.activation_id ? `id:${r.activation_id}` : `name:${nameKeyOf(r.customer_name)}`;
      if (key === "name:") continue;
      const cur = depositsByClient.get(key) ?? { total: 0, count: 0, last: null };
      cur.total += Number(r.amount || 0);
      cur.count += 1;
      if (!cur.last || String(r.date) > cur.last) cur.last = String(r.date);
      depositsByClient.set(key, cur);
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
        neglectedWhale: isNeglectedWhale(
          {
            startDate: a.activation_date,
            potentialValue: a.potential_value,
            depositDates: (depositDatesByClient.get(`id:${a.id}`) ?? depositDatesByClient.get(`name:${nameKeyOf(a.lead_name)}`) ?? []),
            contactDates: comms.map((c) => c.at),
          },
          whaleThreshold,
        ),
      };
    });
    // Keep the clients that matter most: biggest money first, then most recent.
    const clientsRanked = [...clientRecords].sort((a, b) => {
      const av = Math.abs(a.depositTotal) + Math.abs(a.withdrawalTotal) + Math.abs(a.balance);
      const bv = Math.abs(b.depositTotal) + Math.abs(b.withdrawalTotal) + Math.abs(b.balance);
      if (bv !== av) return bv - av;
      return String(b.activationDate ?? "").localeCompare(String(a.activationDate ?? ""));
    });

    const snapshot = {
      whaleThreshold,
      today: new Date().toISOString().slice(0, 10),
      window: `${sinceIso} to today`,
      selectedPeriod: focusPeriod,
      currency: "USD",
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
      // STDs exactly as the app counts them (second deposit, same month as the
      // activation). This is the retention scoreboard.
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
              "Be short: two or three sentences, with the concrete numbers you used. Amounts are USD. " +
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
              "WHALES: a client is a whale when potentialValue >= snapshot.whaleThreshold (the money we believe they can bring). " +
              "neglectedWhale means a whale who neither deposited nor was contacted in the 14 days after activation. " +
              "CLIENTS: snapshot.clients is a per-client list — name, both agents, activation and qualification dates, CRM status, " +
              "potential, age/country/language/occupation, tags, team notes, the latest logged calls/messages (recentContacts) and " +
              "the latest team comments (recentComments), plus openingBalance, depositTotal/Count, lastDeposit, withdrawalTotal/Count, " +
              "lastWithdrawal, current balance and any stored AI riskScore/riskLabel (0-100, higher = needs attention). " +
              "Use it to answer questions about a named person, to list clients who have not deposited recently, who withdrew the most, " +
              "who is at risk, or to slice clients by age, country, status or agent. Compare dates against snapshot.today. " +
              "If clientsTruncated is true, say the list covers the top " +
              "clients by money movement out of clientCount total, and never imply it is exhaustive. " +
              "If the snapshot does not contain the answer, say exactly what is missing instead of guessing." }],


          },
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
