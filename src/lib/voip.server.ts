/**
 * Server-only VoIP helpers (Twilio via the Lovable connector gateway).
 *
 * Calls are placed agent-first: Twilio rings the agent's own phone, and when
 * they pick up the TwiML at `/api/public/twilio/twiml` bridges the client.
 * That keeps the agent's real number hidden behind the company's Twilio
 * number and needs no browser SDK.
 *
 * The public TwiML / status callbacks are protected with a short HMAC token
 * we mint here, so only URLs this app produced can be replayed.
 */
import { createHmac, timingSafeEqual } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

export type VoipConfig = {
  lovableKey: string;
  twilioKey: string;
  fromNumber: string;
  baseUrl: string;
};

export function readVoipConfig(): { ok: true; config: VoipConfig } | { ok: false; reason: string } {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const twilioKey = process.env["TWILIO_API_KEY"];
  const fromNumber = process.env["TWILIO_FROM_NUMBER"];
  const baseUrl = process.env["PUBLIC_BASE_URL"] ?? process.env["VITE_PUBLIC_BASE_URL"];

  if (!twilioKey) return { ok: false, reason: "Twilio is not connected yet." };
  if (!lovableKey) return { ok: false, reason: "Gateway credentials are missing." };
  if (!fromNumber) return { ok: false, reason: "No Twilio caller-ID number is configured (TWILIO_FROM_NUMBER)." };
  if (!baseUrl) return { ok: false, reason: "No public base URL is configured (PUBLIC_BASE_URL)." };
  return { ok: true, config: { lovableKey, twilioKey, fromNumber, baseUrl: baseUrl.replace(/\/$/, "") } };
}

function secret() {
  return process.env["JOB_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "ledgerly-voip";
}

export function signCallToken(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
}

export function verifyCallToken(payload: string, token: string | null) {
  if (!token) return false;
  const expected = signCallToken(payload);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST form-encoded to the Twilio REST API through the connector gateway. */
export async function twilioPost(cfg: VoipConfig, path: string, form: Record<string, string>) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.lovableKey}`,
      "X-Connection-Api-Key": cfg.twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Twilio request failed [${res.status}]: ${text}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export function escapeXml(v: string) {
  return v.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c,
  );
}
