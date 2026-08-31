/**
 * Per-client KYC checklist, stored as jsonb on `daily_lead_activations.kyc`.
 */

export const KYC_ITEMS = [
  { key: "id_verified", label: "ID verified" },
  { key: "proof_of_address", label: "Proof of address" },
  { key: "proof_of_funds", label: "Proof of funds" },
  { key: "agreement_signed", label: "Agreement signed" },
] as const;

export type KycKey = (typeof KYC_ITEMS)[number]["key"];

export type KycEntry = { done: boolean; at?: string | null; by?: string | null };
export type Kyc = Partial<Record<KycKey, KycEntry>>;

export function parseKyc(raw: unknown): Kyc {
  if (!raw || typeof raw !== "object") return {};
  const out: Kyc = {};
  for (const item of KYC_ITEMS) {
    const v = (raw as Record<string, unknown>)[item.key];
    if (v && typeof v === "object") {
      const e = v as KycEntry;
      out[item.key] = { done: !!e.done, at: e.at ?? null, by: e.by ?? null };
    } else if (v === true) {
      out[item.key] = { done: true };
    }
  }
  return out;
}

export const kycDoneCount = (k: Kyc): number => KYC_ITEMS.filter((i) => k[i.key]?.done).length;

export type KycStatus = "complete" | "partial" | "missing";

export function kycStatus(raw: unknown): KycStatus {
  const done = kycDoneCount(parseKyc(raw));
  if (done >= KYC_ITEMS.length) return "complete";
  return done > 0 ? "partial" : "missing";
}

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  complete: "KYC complete",
  partial: "KYC partial",
  missing: "KYC missing",
};

export const KYC_STATUS_TONE: Record<KycStatus, string> = {
  complete: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  partial: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  missing: "border-rose-500/50 text-rose-600 dark:text-rose-400",
};

/** Toggle one item, stamping who did it and when. */
export function toggleKyc(raw: unknown, key: KycKey, done: boolean, by?: string | null): Kyc {
  const k = parseKyc(raw);
  k[key] = done ? { done: true, at: new Date().toISOString(), by: by ?? null } : { done: false };
  return k;
}
