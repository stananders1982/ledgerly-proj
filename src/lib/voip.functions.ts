/**
 * Click-to-call server functions.
 *
 * The client never sees Twilio credentials: the browser asks for a call, the
 * server places it through the connector gateway and logs the touchpoint.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VoipReadiness = { ready: boolean; reason: string | null };

/** Whether click-to-call is usable, so the UI can fall back to `tel:` links. */
export const voipReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<VoipReadiness> => {
    const { readVoipConfig } = await import("@/lib/voip.server");
    const cfg = readVoipConfig();
    return cfg.ok ? { ready: true, reason: null } : { ready: false, reason: cfg.reason };
  });

export type PlaceCallInput = {
  /** Client's number in E.164. */
  to: string;
  /** Agent's own phone, rung first. */
  agent: string;
  activationId?: string | null;
  clientName?: string | null;
};

export const placeVoipCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PlaceCallInput) => {
    const e164 = /^\+\d{7,15}$/;
    if (!e164.test(String(input?.to ?? ""))) throw new Error("Client number must be in international format, e.g. +447700900123");
    if (!e164.test(String(input?.agent ?? ""))) throw new Error("Your callback number must be in international format, e.g. +447700900123");
    return {
      to: String(input.to),
      agent: String(input.agent),
      activationId: input.activationId ? String(input.activationId) : null,
      clientName: input.clientName ? String(input.clientName).slice(0, 120) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const { readVoipConfig, twilioPost, signCallToken } = await import("@/lib/voip.server");
    const cfg = readVoipConfig();
    if (!cfg.ok) throw new Error(cfg.reason);

    const { config } = cfg;
    const payload = `${data.to}|${data.activationId ?? ""}`;
    const token = signCallToken(payload);
    const params = new URLSearchParams({
      to: data.to,
      activation: data.activationId ?? "",
      token,
    });

    const result = await twilioPost(config, "/Calls.json", {
      To: data.agent,
      From: config.fromNumber,
      Url: `${config.baseUrl}/api/public/twilio/twiml?${params.toString()}`,
      StatusCallback: `${config.baseUrl}/api/public/twilio/status?${params.toString()}`,
      StatusCallbackEvent: "completed",
      StatusCallbackMethod: "POST",
    });

    // Log the attempt straight away as the caller, so RLS and the audit trail
    // behave exactly like a manually logged touchpoint.
    if (data.activationId) {
      await context.supabase.from("client_communications").insert({
        activation_id: data.activationId,
        client_name: data.clientName,
        channel: "call",
        direction: "outbound",
        summary: "Click-to-call placed",
      });
    }

    return { sid: String(result["sid"] ?? ""), status: String(result["status"] ?? "queued") };
  });
