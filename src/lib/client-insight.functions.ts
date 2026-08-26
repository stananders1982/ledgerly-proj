import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reads one client's whole story — profile, comments, calls, deposits and
 * withdrawals — and returns a short human read, a recommended next action and
 * a 0–100 attention score. The score is stored on the client so the list can
 * show a badge. Everything goes through the caller's own client, so row-level
 * rules decide what is visible.
 */
export const analyseClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { activationId: string }) => {
    const id = String(input?.activationId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Pick a client first.");
    return { activationId: id };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");
    const supabase = context.supabase;

    const { data: client, error } = await supabase
      .from("daily_lead_activations")
      .select("*, daily_lead_entries(entry_date, lead_sources(name))")
      .eq("id", data.activationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Client not found.");

    const name = (client as any).lead_name as string | null;

    const [deposits, withdrawals, comms, comments] = await Promise.all([
      supabase
        .from("revenue")
        .select("date,amount,notes,method,activation_id,customer_name")
        .or(
          name
            ? `activation_id.eq.${data.activationId},customer_name.ilike.${name.replace(/[,()]/g, " ").trim()}`
            : `activation_id.eq.${data.activationId}`,
        )
        .order("date", { ascending: true }),
      name
        ? supabase
            .from("withdrawals")
            .select("date,amount,notes,customer_name")
            .ilike("customer_name", name)
            .order("date", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("client_communications")
        .select("occurred_at,channel,direction,summary")
        .eq("activation_id", data.activationId)
        .order("occurred_at", { ascending: false })
        .limit(40),
      supabase
        .from("record_comments")
        .select("created_at,body,user_email")
        .eq("entity_type", "client")
        .eq("entity_id", data.activationId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const c = client as any;
    const depRows = ((deposits as any).data ?? []) as any[];
    const wdRows = ((withdrawals as any).data ?? []) as any[];
    const depTotal = depRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const wdTotal = wdRows.reduce((s, r) => s + Number(r.amount || 0), 0);

    const profile = {
      name: name ?? "Unnamed client",
      status: c.status ?? null,
      potential: c.potential ?? null,
      answered: !!c.answered,
      age: c.age ?? null,
      dateOfBirth: c.date_of_birth ?? null,
      gender: c.gender ?? null,
      country: c.country ?? null,
      city: c.city ?? null,
      language: c.language ?? null,
      occupation: c.occupation ?? null,
      preferredContactTime: c.preferred_contact_time ?? null,
      nextFollowUp: c.next_follow_up ?? null,
      tags: c.tags ?? [],
      potentialValue: c.potential_value != null ? Number(c.potential_value) : null,
      kyc: {
        netWorth: c.net_worth != null ? Number(c.net_worth) : null,
        liquidFunds: c.liquid_funds != null ? Number(c.liquid_funds) : null,
        monthlyIncome: c.monthly_income != null ? Number(c.monthly_income) : null,
        investedElsewhere: c.exposure_elsewhere != null ? Number(c.exposure_elsewhere) : null,
        sourceOfFunds: c.source_of_funds ?? null,
        depositAppetite: c.deposit_appetite != null ? Number(c.deposit_appetite) : null,
      },
      notes: c.notes ?? null,
      source: c.daily_lead_entries?.lead_sources?.name ?? null,
      leadReceived: c.daily_lead_entries?.entry_date ?? null,
      activationDate: c.activation_date ?? null,
      qualifiedAt: c.qualified_at ?? null,
      openingBalance: Number(c.balance || 0),
      depositTotal: Math.round(depTotal),
      depositCount: depRows.length,
      withdrawalTotal: Math.round(wdTotal),
      withdrawalCount: wdRows.length,
      currentBalance: Math.round(Number(c.balance || 0) + depTotal - wdTotal),
      lastDeposit: depRows.length ? depRows[depRows.length - 1] : null,
      lastWithdrawal: wdRows.length ? wdRows[wdRows.length - 1] : null,
      deposits: depRows.map((r) => ({ date: r.date, amount: Number(r.amount || 0), method: r.method ?? null, notes: r.notes ?? null })),
      withdrawals: wdRows.map((r) => ({ date: r.date, amount: Number(r.amount || 0), notes: r.notes ?? null })),
      communications: (((comms as any).data ?? []) as any[]).map((r) => ({
        at: r.occurred_at, channel: r.channel, direction: r.direction, summary: r.summary ?? null,
      })),
      comments: (((comments as any).data ?? []) as any[]).map((r) => ({
        at: r.created_at, by: r.user_email ?? "teammate", text: r.body,
      })),
      today: new Date().toISOString().slice(0, 10),
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
              "You are a retention analyst for a client-deposit business. Read one client's JSON record — profile, comments " +
              "from the team, logged calls/messages, deposits and withdrawals — and reply with ONLY a JSON object, no prose " +
              "and no code fences, shaped exactly: " +
              '{"summary": string, "next_action": string, "risk_score": number, "risk_label": string, ' +
              '"opportunity_score": number, "opportunity_label": string, "opportunity_reason": string, "suggested_potential": number}. ' +
              "summary: 2–4 short sentences on behaviour and momentum, quoting concrete numbers and dates and what the team's " +
              "comments say. next_action: one concrete step the agent should take next. risk_score: 0–100 where 100 means the " +
              "client is about to be lost or is already gone and 0 means healthy and growing; weigh withdrawal pattern, days " +
              "since the last deposit, deposit trend, unanswered contact and negative comments. risk_label: one of " +
              '"healthy", "growing", "watch", "at risk", "churning", "lost", or "upsell". ' +
              "opportunity_score: 0–100 for how much MORE money we can realistically still take from this client; judge it from the " +
              "financial KYC block (net worth, liquid funds, monthly income, money invested elsewhere, source of funds, deposit " +
              "appetite 1–5), what the comments and calls say about their willingness and circumstances, and how much they already " +
              "deposited versus that capacity. High score = plenty of untapped headroom. opportunity_label: exactly one of " +
              '"whale", "warm", "tapped out", "at risk". opportunity_reason: one short sentence naming the facts behind the score. ' +
              "suggested_potential: your own USD estimate of the total this client can ever deposit (0 if there is nothing to go on). " +
              "Amounts are USD. Never invent data." }],
          },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(profile) }] },
        ],
      }),
    });

    if (res.status === 429) throw new Error("AI is rate limited right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    if (!res.ok) throw new Error(`AI request failed (${res.status}).`);

    const json = (await res.json()) as any;
    const raw = String(
      json?.output_text ??
      json?.output?.flatMap((i: any) => i?.content ?? []).find((i: any) => i?.type === "output_text")?.text ??
      "",
    ).trim();

    const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const m = jsonText.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }
    if (!parsed) throw new Error("The analysis came back unreadable — try again.");

    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.risk_score) || 0)));
    const oppScoreRaw = Number(parsed.opportunity_score);
    const suggested = Number(parsed.suggested_potential);
    const patch = {
      ai_opportunity_score: Number.isFinite(oppScoreRaw)
        ? Math.max(0, Math.min(100, Math.round(oppScoreRaw)))
        : null,
      ai_opportunity_label: String(parsed.opportunity_label ?? "").slice(0, 40).toLowerCase() || null,
      ai_opportunity_reason: String(parsed.opportunity_reason ?? "").slice(0, 500) || null,
      ai_suggested_potential: Number.isFinite(suggested) && suggested > 0 ? Math.round(suggested) : null,
      ai_summary: String(parsed.summary ?? "").slice(0, 2000) || null,
      ai_next_action: String(parsed.next_action ?? "").slice(0, 500) || null,
      ai_risk_score: score,
      ai_risk_label: String(parsed.risk_label ?? "").slice(0, 40) || null,
      ai_analyzed_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("daily_lead_activations")
      .update(patch as any)
      .eq("id", data.activationId);
    if (upErr) throw new Error(upErr.message);

    return patch;
  });
