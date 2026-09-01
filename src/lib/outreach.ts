/**
 * Click-to-reach helpers.
 *
 * Every outreach action in the app funnels through these builders so the
 * phone/email formatting is identical everywhere and each attempt can be
 * logged the same way.
 */

/** Digits only, no leading +, as `wa.me` expects. */
export function waNumber(phone?: string | null): string | null {
  const digits = String(phone ?? "").replace(/[^\d]/g, "");
  return digits.length >= 7 ? digits : null;
}

/** E.164-ish number for `tel:` links and VoIP dialling. */
export function dialNumber(phone?: string | null): string | null {
  const raw = String(phone ?? "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  return raw.trim().startsWith("+") ? `+${digits}` : `+${digits}`;
}

export function telLink(phone?: string | null): string | null {
  const n = dialNumber(phone);
  return n ? `tel:${n}` : null;
}

export function waLink(phone?: string | null, message?: string): string | null {
  const n = waNumber(phone);
  if (!n) return null;
  return message ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : `https://wa.me/${n}`;
}

export function mailtoLink(email?: string | null, subject?: string, body?: string): string | null {
  const e = String(email ?? "").trim();
  if (!e.includes("@")) return null;
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const qs = params.toString();
  return qs ? `mailto:${e}?${qs}` : `mailto:${e}`;
}

/** Open an outreach link in a way that works from a click handler. */
export function openOutreach(href: string) {
  if (typeof window === "undefined") return;
  window.open(href, href.startsWith("http") ? "_blank" : "_self", "noopener,noreferrer");
}
