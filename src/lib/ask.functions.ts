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

    const [revenue, expenses, withdrawals, activations, leads, sources, employees, categories] =
      await Promise.all([
        supabase.from("revenue").select("date,amount,customer_name,employee_id,affiliate_id,method").gte("date", sinceIso),
        supabase.from("expenses").select("date,amount,category_id").gte("date", sinceIso),
        supabase.from("withdrawals").select("date,amount,employee_id").gte("date", sinceIso),
        supabase.from("daily_lead_activations").select("activation_date,qualified_at,employee_id,conversion_employee_id,entry_id").gte("activation_date", sinceIso),
        supabase.from("daily_lead_entries").select("entry_date,received,activated,reported,cost,source_id").gte("entry_date", sinceIso),
        supabase.from("lead_sources").select("id,name,pricing_model,price"),
        supabase.from("employees").select("id,name,team,active"),
        supabase.from("expense_categories").select("id,name"),
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
      activationsByConversionAgent: bucket(
        activations.data,
        (a: any) => nameOf(employees.data, a.conversion_employee_id),
        () => 1,
      ),
      expensesByCategory: round(
        bucket(expenses.data, (e: any) => nameOf(categories.data, e.category_id), (e: any) => Number(e.amount || 0)),
      ),
      depositsByMethod: round(
        bucket(revenue.data, (r: any) => r.method || "unspecified", (r: any) => Number(r.amount || 0)),
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
