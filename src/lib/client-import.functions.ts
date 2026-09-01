import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reads a raw block of text pasted from another CRM (a client card, an email,
 * a chat log, a table copy) and returns structured client records.
 *
 * It NEVER writes anything: the caller reviews each field and applies the ones
 * it wants through the normal update path, so row-level rules still decide
 * what may change.
 */

export type ExtractedClient = {
  lead_name?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  language?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
  occupation?: string | null;
  status?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  next_follow_up?: string | null;
  preferred_contact_time?: string | null;
  potential_value?: number | null;
  net_worth?: number | null;
  liquid_funds?: number | null;
  monthly_income?: number | null;
  exposure_elsewhere?: number | null;
  source_of_funds?: string | null;
  deposit_appetite?: number | null;
};

export type ExtractionResult = {
  clients: ExtractedClient[];
  /** Things the text mentioned that no field can hold (deposits, tickets…). */
  unmapped_notes: string | null;
};

const TEXT_FIELDS = [
  "lead_name", "phone", "email", "country", "city", "language", "gender",
  "date_of_birth", "occupation", "status", "notes", "next_follow_up",
  "preferred_contact_time", "source_of_funds",
] as const;

const NUMBER_FIELDS = [
  "age", "potential_value", "net_worth", "liquid_funds", "monthly_income",
  "exposure_elsewhere", "deposit_appetite",
] as const;

const STATUSES = ["hot", "warm", "cold", "dormant", "churned"];
const CONTACT_TIMES = ["morning", "afternoon", "evening", "weekend"];
const GENDERS = ["male", "female", "other"];

function isDate(v: unknown) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function clean(raw: any): ExtractedClient | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = {};

  for (const key of TEXT_FIELDS) {
    const v = raw[key];
    if (v === null || v === undefined) continue;
    let s = String(v).trim();
    if (!s || s.toLowerCase() === "unknown" || s === "-") continue;
    if (key === "status") {
      s = s.toLowerCase();
      if (!STATUSES.includes(s)) continue;
    }
    if (key === "preferred_contact_time") {
      s = s.toLowerCase();
      if (!CONTACT_TIMES.includes(s)) continue;
    }
    if (key === "gender") {
      s = s.toLowerCase();
      if (!GENDERS.includes(s)) continue;
    }
    if ((key === "date_of_birth" || key === "next_follow_up") && !isDate(s)) continue;
    out[key] = s.slice(0, key === "notes" ? 4000 : 200);
  }

  for (const key of NUMBER_FIELDS) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) continue;
    if (key === "age" && (n <= 0 || n > 120)) continue;
    if (key === "deposit_appetite" && (n < 1 || n > 5)) continue;
    if (n < 0) continue;
    out[key] = key === "deposit_appetite" || key === "age" ? Math.round(n) : Math.round(n * 100) / 100;
  }

  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 12);
    if (tags.length) out.tags = tags;
  }

  return Object.keys(out).length ? (out as ExtractedClient) : null;
}

const SYSTEM = [
  "You extract client (customer) records from raw text pasted out of another CRM, an email, a chat log or a spreadsheet.",
  "Reply with ONLY a JSON object, no prose and no code fences, shaped exactly:",
  '{"clients": [ { ...fields } ], "unmapped_notes": string }',
  "Allowed fields per client, all optional — OMIT any field the text does not clearly support, never guess:",
  "lead_name (full name), phone, email, country, city, language, gender (male|female|other),",
  "date_of_birth (YYYY-MM-DD), age (number), occupation,",
  'status (exactly one of hot|warm|cold|dormant|churned — infer from wording like "very interested" = hot, "no answer for months" = dormant),',
  "tags (short array of labels), notes (a tidy summary of anything useful that has no field of its own),",
  "next_follow_up (YYYY-MM-DD), preferred_contact_time (morning|afternoon|evening|weekend),",
  "potential_value (USD total this client could ever deposit), net_worth, liquid_funds, monthly_income,",
  "exposure_elsewhere (money invested with other brokers), source_of_funds, deposit_appetite (1-5 readiness to fund).",
  "All money is a plain number in USD; convert other currencies at a sensible approximate rate and mention the original in notes.",
  "Relative dates are resolved against today's date, given in the user message.",
  "If the text describes several people, return one object per person. If it describes one person, return exactly one object.",
  "unmapped_notes: one short paragraph listing facts the fields cannot hold (past deposits, withdrawals, tickets, documents) or an empty string.",
].join(" ");

export const extractClientsFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; singleClient?: boolean }) => {
    const text = String(input?.text ?? "").trim();
    if (text.length < 5) throw new Error("Paste some text first.");
    if (text.length > 30000) throw new Error("That paste is too long — split it into smaller chunks.");
    return { text, singleClient: !!input?.singleClient };
  })
  .handler(async ({ data }): Promise<ExtractionResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const today = new Date().toISOString().slice(0, 10);
    const system = data.singleClient
      ? `${SYSTEM} This paste is about ONE client only: return exactly one object in "clients".`
      : SYSTEM;

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
          { role: "system", content: [{ type: "input_text", text: system }] },
          {
            role: "user",
            content: [{ type: "input_text", text: `Today is ${today}.\n\nRaw text:\n"""\n${data.text}\n"""` }],
          },
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
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }
    if (!parsed) throw new Error("The reading came back unreadable — try again.");

    const list = Array.isArray(parsed.clients) ? parsed.clients : [parsed];
    const clients = list.map(clean).filter(Boolean) as ExtractedClient[];
    if (!clients.length) throw new Error("Nothing usable was found in that text.");

    return {
      clients: data.singleClient ? clients.slice(0, 1) : clients.slice(0, 100),
      unmapped_notes: String(parsed.unmapped_notes ?? "").trim().slice(0, 1500) || null,
    };
  });
