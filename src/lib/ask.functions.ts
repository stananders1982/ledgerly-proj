import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .inputValidator((input: { question: string }) => {
    const question = String(input?.question ?? "").trim();
    if (!question) throw new Error("Ask a question first.");
    if (question.length > 500) throw new Error("Question is too long.");
    return { question };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const supabase = context.supabase;
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const sinceIso = since.toISOString().slice(0, 10);

    const [revenue, expenses, withdrawals, activations, leads, sources, employees, categories, affiliates] =
      await Promise.all([
        supabase.from("revenue").select("date,amount,customer_name,employee_id,affiliate_id,method").gte("date", sinceIso),
        supabase.from("expenses").select("date,amount,category_id").gte("date", sinceIso),
        supabase.from("withdrawals").select("date,amount,employee_id").gte("date", sinceIso),
        supabase.from("daily_lead_activations").select("activation_date,qualified_at,employee_id,conversion_employee_id,entry_id").gte("activation_date", sinceIso),
        supabase.from("daily_lead_entries").select("entry_date,received,activated,reported,cost,source_id").gte("entry_date", sinceIso),
        supabase.from("lead_sources").select("id,name,pricing_model,price"),
        supabase.from("employees").select("id,name,team,active"),
        supabase.from("expense_categories").select("id,name"),
        supabase.from("affiliates").select("id,name"),
      ]);

    const month = (d: string | null) => (d ?? "").slice(0, 7);
    const nameOf = (rows: any[] | null, id: string | null | undefined) =>
      rows?.find((r) => r.id === id)?.name ?? "unassigned";

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

    // A client's first deposit in the window is the FTD; everything after is
    // retention work (STD and beyond).
    const firstDepositDate = new Map<string, string>();
    for (const r of (revenue.data ?? []) as any[]) {
      const k = (r.customer_name ?? "").trim().toLowerCase();
      if (!k) continue;
      const prev = firstDepositDate.get(k);
      if (!prev || String(r.date) < prev) firstDepositDate.set(k, String(r.date));
    }
    const seenFirst = new Set<string>();
    const repeatDeposits = ((revenue.data ?? []) as any[])
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .filter((r) => {
        const k = (r.customer_name ?? "").trim().toLowerCase();
        if (!k) return false;
        if (!seenFirst.has(k)) {
          seenFirst.add(k);
          return false;
        }
        return true;
      });


    const snapshot = {
      today: new Date().toISOString().slice(0, 10),
      window: `${sinceIso} to today`,
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
        bucket(revenue.data, (r: any) => nameOf(employees.data, r.employee_id), (r: any) => Number(r.amount || 0)),
      ),
      // "month | agent" keys so month-specific agent questions are answerable.
      depositsByMonthAndAgent: round(
        bucket(
          revenue.data,
          (r: any) => `${month(r.date)} | ${nameOf(employees.data, r.employee_id)}`,
          (r: any) => Number(r.amount || 0),
        ),
      ),
      activationsByConversionAgent: bucket(
        activations.data,
        (a: any) => nameOf(employees.data, a.conversion_employee_id),
        () => 1,
      ),
      // Activation clock: counted in the month the lead was activated.
      activationsByMonthActivatedAndAgent: bucket(
        activations.data,
        (a: any) => `${month(a.activation_date)} | ${nameOf(employees.data, a.conversion_employee_id)}`,
        () => 1,
      ),
      // Qualification clock: counted in the month the FTD became valid. This
      // includes leads activated in earlier months, so it is normally larger
      // than the activation count for the same month — they are not subsets.
      qualifiedFtdsByMonthQualifiedAndAgent: bucket(
        (activations.data ?? []).filter((a: any) => a.qualified_at),
        (a: any) => `${month(a.qualified_at)} | ${nameOf(employees.data, a.conversion_employee_id)}`,
        () => 1,
      ),
      // Of those qualified in a month, how many were activated in an earlier month.
      qualifiedFromEarlierMonthsByMonthAndAgent: bucket(
        (activations.data ?? []).filter(
          (a: any) => a.qualified_at && month(a.qualified_at) !== month(a.activation_date),
        ),
        (a: any) => `${month(a.qualified_at)} | ${nameOf(employees.data, a.conversion_employee_id)}`,
        () => 1,
      ),
      // Of a month's own activations, how many qualified within that same month.
      qualifiedSameMonthByMonthAndAgent: bucket(
        (activations.data ?? []).filter(
          (a: any) => a.qualified_at && month(a.qualified_at) === month(a.activation_date),
        ),
        (a: any) => `${month(a.activation_date)} | ${nameOf(employees.data, a.conversion_employee_id)}`,
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
        (employees.data ?? []).map((e: any) => [e.name, e.team ?? "—"]),
      ),
      // Retention work only: deposits that are NOT a client's first deposit,
      // credited to the agent on the deposit. Keys are "month | agent".
      retentionDepositsByMonthAndAgent: round(
        bucket(
          repeatDeposits,
          (r: any) => `${month(r.date)} | ${nameOf(employees.data, r.employee_id)}`,
          (r: any) => Number(r.amount || 0),
        ),
      ),
      // Count of repeat deposits (STD and beyond) per month and agent.
      retentionDepositCountByMonthAndAgent: bucket(
        repeatDeposits,
        (r: any) => `${month(r.date)} | ${nameOf(employees.data, r.employee_id)}`,
        () => 1,
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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You answer questions about a lead-generation and client-deposit business using ONLY the JSON snapshot provided. " +
              "Be short: two or three sentences, with the concrete numbers you used. Amounts are USD. " +
              "FTD means first-time deposit (an activated client); STD means a second deposit. " +
              "DEFAULT RULE: 'FTDs', 'activations', 'conversions' and 'how many clients' always mean the ACTIVATION clock — " +
              "leads activated in that period, from activationsByMonthActivatedAndAgent / totals.activations. " +
              "For those questions answer with the activation number only; do NOT mention qualified FTDs, the qualification clock, " +
              "or the earlier-months backlog at all. " +
              "Use the qualification clock (qualifiedFtdsByMonthQualifiedAndAgent) ONLY when the question is about commission, payouts, " +
              "or explicitly says qualified/valid FTDs, or explicitly asks for both clocks. In that case name each clock, and you may use " +
              "qualifiedFromEarlierMonthsByMonthAndAgent (carried over from earlier months) and qualifiedSameMonthByMonthAndAgent " +
              "(that month's own activations which already qualified) to explain the make-up. " +
              "For 'who is leading', rank by activations by default; rank by qualified FTDs only when the question is about commission or pay, and say so. " +
              "If the snapshot does not contain the answer, say exactly what is missing instead of guessing.",

          },
          { role: "user", content: `Snapshot:\n${JSON.stringify(snapshot)}\n\nQuestion: ${data.question}` },
        ],
      }),
    });

    if (res.status === 429) throw new Error("AI is rate limited right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    if (!res.ok) throw new Error(`AI request failed (${res.status}).`);

    const json = (await res.json()) as any;
    const answer = json?.choices?.[0]?.message?.content?.trim();
    return { answer: answer || "No answer came back — try rephrasing the question." };
  });
