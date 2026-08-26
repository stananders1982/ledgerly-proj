/**
 * Shared CRM profile helpers for client records (`daily_lead_activations`).
 *
 * These fields are pure customer-relationship context — nothing here feeds the
 * FTD/STD money rules, which stay in `rules.ts`.
 */

export const CLIENT_STATUSES = ["hot", "warm", "cold", "dormant", "churned"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CONTACT_TIMES = ["morning", "afternoon", "evening", "weekend"] as const;
export const GENDERS = ["male", "female", "other"] as const;

export type ClientProfile = {
  /** How much money we realistically believe this client can bring in ($). */
  potential_value?: number | null;
  /** Financial KYC: estimated total net worth ($). */
  net_worth?: number | null;
  /** Financial KYC: funds they can actually move now ($). */
  liquid_funds?: number | null;
  /** Financial KYC: income per month ($). */
  monthly_income?: number | null;
  /** Financial KYC: roughly how much sits with other brokers ($). */
  exposure_elsewhere?: number | null;
  /** Financial KYC: where the money comes from. */
  source_of_funds?: string | null;
  /** Financial KYC: 1-5 read on how ready they are to add funds. */
  deposit_appetite?: number | null;
  /** AI: 0-100, how much more money we can realistically take. */
  ai_opportunity_score?: number | null;
  /** AI: whale / warm / tapped out / at risk. */
  ai_opportunity_label?: string | null;
  /** AI: the facts behind the opportunity score. */
  ai_opportunity_reason?: string | null;
  /** AI: its own read of the potential value ($). */
  ai_suggested_potential?: number | null;
  date_of_birth?: string | null;
  age?: number | null;
  gender?: string | null;
  country?: string | null;
  city?: string | null;
  language?: string | null;
  phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  status?: string | null;
  next_follow_up?: string | null;
  preferred_contact_time?: string | null;
  ai_risk_score?: number | null;
  ai_risk_label?: string | null;
  ai_summary?: string | null;
  ai_next_action?: string | null;
  ai_analyzed_at?: string | null;
};

/** Age from the date of birth when present, otherwise the typed-in age. */
export function clientAge(p: ClientProfile | null | undefined): number | null {
  if (!p) return null;
  if (p.date_of_birth) {
    const dob = new Date(`${String(p.date_of_birth).slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(dob.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      const m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
      if (age >= 0 && age < 130) return age;
    }
  }
  const n = Number(p.age);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export const STATUS_TONE: Record<string, string> = {
  hot: "border-rose-500/50 text-rose-600 dark:text-rose-400",
  warm: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  cold: "border-sky-500/50 text-sky-600 dark:text-sky-400",
  dormant: "border-muted-foreground/40 text-muted-foreground",
  churned: "border-muted-foreground/40 text-muted-foreground",
};

/** 0–100, higher = more attention needed. */
export function riskTone(score?: number | null): string {
  const n = Number(score);
  if (!Number.isFinite(n)) return "border-muted-foreground/40 text-muted-foreground";
  if (n >= 70) return "border-rose-500/50 text-rose-600 dark:text-rose-400";
  if (n >= 40) return "border-amber-500/50 text-amber-600 dark:text-amber-400";
  return "border-emerald-500/50 text-emerald-600 dark:text-emerald-400";
}

/** Days since a date string, or null when there is no date. */
export function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}
