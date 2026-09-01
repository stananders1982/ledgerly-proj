import { createFileRoute } from "@tanstack/react-router";

/**
 * TwiML played to the agent when Twilio rings them: it immediately bridges
 * the client. Only URLs signed by this app are accepted.
 */
async function handle(request: Request) {
  const { verifyCallToken, escapeXml } = await import("@/lib/voip.server");
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? "";
  const activation = url.searchParams.get("activation") ?? "";
  const token = url.searchParams.get("token");

  if (!/^\+\d{7,15}$/.test(to) || !verifyCallToken(`${to}|${activation}`, token)) {
    return new Response("<Response><Reject/></Response>", {
      status: 403,
      headers: { "content-type": "application/xml" },
    });
  }

  const from = process.env["TWILIO_FROM_NUMBER"] ?? "";
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Dial callerId="${escapeXml(from)}" answerOnBridge="true">` +
    `<Number>${escapeXml(to)}</Number></Dial></Response>`;

  return new Response(xml, {
    status: 200,
    headers: { "content-type": "application/xml", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/twilio/twiml")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
