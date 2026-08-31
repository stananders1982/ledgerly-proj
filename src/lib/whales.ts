/**
 * Client value tiers and whale helpers.
 *
 * Every client carries a recorded potential value — how much money we
 * realistically believe they can put in. That number is bucketed into named
 * tiers (Whale is simply the top one) using per-company thresholds, and a
 * "neglected" client is one that, in the 14 days after their FTD / activation
 * date, neither deposited nor was contacted.
 */

export const NEGLECT_WINDOW_DAYS = 14;

export function potentialValue(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------------ tiers */

export const VALUE_TIERS = ["whale", "high", "mid", "small", "unrated"] as const;
export type ValueTier = (typeof VALUE_TIERS)[number];

export type TierThresholds = {
  whaleThreshold: number;
  highThreshold: number;
  midThreshold: number;
  smallThreshold: number;
};

export const TIER_LABEL: Record<ValueTier, string> = {
  whale: "Whale",
  high: "High",
  mid: "Mid",
  small: "Small",
  unrated: "Unrated",
};

export const TIER_TONE: Record<ValueTier, string> = {
  whale: "border-sky-500/50 text-sky-600 dark:text-sky-400",
  high: "border-violet-500/50 text-violet-600 dark:text-violet-400",
  mid: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  small: "border-muted-foreground/40 text-muted-foreground",
  unrated: "border-muted-foreground/30 text-muted-foreground",
};

/** Sort weight so a tier column orders Whale → Unrated. */
export const TIER_RANK: Record<ValueTier, number> = {
  whale: 4, high: 3, mid: 2, small: 1, unrated: 0,
};

/** Which value band a potential number falls into. */
export function valueTier(v: unknown, t: TierThresholds): ValueTier {
  const n = potentialValue(v);
  if (n == null) return "unrated";
  if (n >= t.whaleThreshold) return "whale";
  if (n >= t.highThreshold) return "high";
  if (n >= t.midThreshold) return "mid";
  if (n >= t.smallThreshold) return "small";
  return "unrated";
}

export function isWhale(v: unknown, threshold: number): boolean {
  const n = potentialValue(v);
  return n != null && n >= threshold;
}

/* ---------------------------------------------------- opportunity (AI) */

export const OPPORTUNITY_TIERS = ["whale", "warm", "tapped out", "at risk", "unknown"] as const;
export type OpportunityTier = (typeof OPPORTUNITY_TIERS)[number];

export const OPPORTUNITY_TONE: Record<string, string> = {
  whale: "border-sky-500/50 text-sky-600 dark:text-sky-400",
  warm: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  "tapped out": "border-muted-foreground/40 text-muted-foreground",
  "at risk": "border-rose-500/50 text-rose-600 dark:text-rose-400",
  unknown: "border-muted-foreground/30 text-muted-foreground",
};

/** 0–100, higher = more room to take more money. */
export function opportunityTone(score?: number | null): string {
  const n = Number(score);
  if (!Number.isFinite(n)) return "border-muted-foreground/40 text-muted-foreground";
  if (n >= 70) return "border-emerald-500/50 text-emerald-600 dark:text-emerald-400";
  if (n >= 40) return "border-amber-500/50 text-amber-600 dark:text-amber-400";
  return "border-muted-foreground/40 text-muted-foreground";
}

export function normaliseOpportunityTier(label?: string | null): OpportunityTier {
  const l = String(label ?? "").trim().toLowerCase();
  return (OPPORTUNITY_TIERS as readonly string[]).includes(l) ? (l as OpportunityTier) : "unknown";
}

/* -------------------------------------------------------------- neglect */

const day = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : null);

/** Inclusive end of the neglect window for a client (FTD date + 14 days). */
export function neglectWindowEnd(startISO?: string | null): string | null {
  const s = day(startISO);
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + NEGLECT_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

export type NeglectInput = {
  /** Activation (or qualification) date the window starts from. */
  startDate?: string | null;
  potentialValue?: unknown;
  /** Deposit dates for this client (YYYY-MM-DD or ISO). */
  depositDates: (string | null | undefined)[];
  /** Contact dates from the communication log. */
  contactDates: (string | null | undefined)[];
};

/**
 * True when, within the 14 days following activation, we recorded no deposit
 * AND no contact. Tier-agnostic — callers combine it with the tier they care
 * about (Whale for the classic "neglected whale").
 */
export function isNeglected(input: NeglectInput): boolean {
  const start = day(input.startDate);
  const end = neglectWindowEnd(start);
  if (!start || !end) return false;
  // The window must have fully elapsed — a client activated yesterday is not neglected yet.
  if (new Date().toISOString().slice(0, 10) <= end) return false;
  const inWindow = (v?: string | null) => {
    const d = day(v);
    return !!d && d >= start && d <= end;
  };
  if (input.depositDates.some(inWindow)) return false;
  if (input.contactDates.some(inWindow)) return false;
  return true;
}

/** Neglected AND a whale. */
export function isNeglectedWhale(input: NeglectInput, threshold: number): boolean {
  if (!isWhale(input.potentialValue, threshold)) return false;
  return isNeglected(input);
}

/** Most recent date in a list, or null. */
export function lastDate(dates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of dates) {
    const d = day(v);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}
