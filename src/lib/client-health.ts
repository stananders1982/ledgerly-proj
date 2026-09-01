/**
 * Client Health Score — the "Activity Intelligence" layer.
 *
 * Turns raw CRM activity (deposits, contact log, withdrawals, KYC, headroom)
 * into a single 0–100 score with a readable breakdown, so a manager sees
 * *why* a client is healthy or slipping instead of reading four tables.
 *
 * Every factor is a small, explainable delta. Positives add up to 100; the
 * penalties pull the score back down. The score is clamped to 0–100.
 */

import { kycStatus } from "./kyc";
import { potentialValue } from "./whales";

export type HealthBand = "healthy" | "upsell" | "at-risk" | "critical";

export type HealthFactor = {
  key: string;
  label: string;
  points: number;
  /** Short plain-English reason shown next to the points. */
  detail: string;
};

export type ClientHealth = {
  score: number;
  band: HealthBand;
  factors: HealthFactor[];
  /** Money we still believe the client can put in (null when unrated). */
  headroom: number | null;
  daysSinceContact: number | null;
  daysSinceDeposit: number | null;
  /** One-line summary of the biggest thing to do about this client. */
  advice: string;
};

export const HEALTH_BAND_LABEL: Record<HealthBand, string> = {
  healthy: "Healthy",
  upsell: "Upsell opportunity",
  "at-risk": "At risk",
  critical: "Critical",
};

export const HEALTH_BAND_DOT: Record<HealthBand, string> = {
  healthy: "🟢",
  upsell: "🔵",
  "at-risk": "🟡",
  critical: "🔴",
};

export const HEALTH_BAND_TONE: Record<HealthBand, string> = {
  healthy: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  upsell: "border-sky-500/50 text-sky-600 dark:text-sky-400",
  "at-risk": "border-amber-500/50 text-amber-600 dark:text-amber-400",
  critical: "border-rose-500/50 text-rose-600 dark:text-rose-400",
};

/** Sort weight so a health column orders best → worst. */
export const HEALTH_BAND_RANK: Record<HealthBand, number> = {
  upsell: 4, healthy: 3, "at-risk": 2, critical: 1,
};

export type HealthInput = {
  /** Deposit rows for this client, already converted to one currency. */
  deposits: { date?: string | null; amount: number }[];
  /** Payout rows for this client, already converted to one currency. */
  withdrawals: { date?: string | null; amount: number }[];
  /** Communication log timestamps. */
  contactDates: (string | null | undefined)[];
  /** Raw `kyc` jsonb from the client record. */
  kyc?: unknown;
  /** Recorded potential value (what we think they can deposit in total). */
  potentialValue?: unknown;
  /** Activation date — new clients are not punished for a quiet first week. */
  activationDate?: string | null;
  /** Current net balance, used only for the read-out. */
  balance?: number;
  /** Override "today" (tests). */
  now?: Date;
};

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : null);

function daysAgo(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const base = new Date(now.toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.max(0, Math.round((base - t) / 86400000));
}

function latest(dates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of dates) {
    const d = day(v);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

export function clientHealth(input: HealthInput): ClientHealth {
  const now = input.now ?? new Date();
  const factors: HealthFactor[] = [];

  const deposits = (input.deposits ?? []).filter((d) => Number(d.amount) > 0);
  const withdrawals = input.withdrawals ?? [];
  const depositTotal = deposits.reduce((a, d) => a + Number(d.amount || 0), 0);
  const withdrawnTotal = withdrawals.reduce((a, w) => a + Math.abs(Number(w.amount || 0)), 0);

  const lastDeposit = latest(deposits.map((d) => d.date));
  const lastContact = latest(input.contactDates ?? []);
  const daysSinceDeposit = daysAgo(lastDeposit, now);
  const daysSinceContact = daysAgo(lastContact, now);
  const ageDays = daysAgo(day(input.activationDate), now);
  const isNew = ageDays != null && ageDays <= 14;

  /* ---------------------------------------------- deposit activity (+25) */
  let depositActivity = 0;
  let depositDetail = "No deposits recorded";
  if (daysSinceDeposit == null) {
    depositActivity = 0;
  } else if (daysSinceDeposit <= 30) {
    depositActivity = 25;
    depositDetail = `Deposited ${daysSinceDeposit}d ago`;
  } else if (daysSinceDeposit <= 60) {
    depositActivity = 18;
    depositDetail = `Last deposit ${daysSinceDeposit}d ago`;
  } else if (daysSinceDeposit <= 90) {
    depositActivity = 10;
    depositDetail = `Last deposit ${daysSinceDeposit}d ago`;
  } else {
    depositActivity = 4;
    depositDetail = `Nothing new for ${daysSinceDeposit}d`;
  }
  factors.push({ key: "deposit_activity", label: "Deposit activity", points: depositActivity, detail: depositDetail });

  /* ------------------------------------------------ deposit frequency (+20) */
  const n = deposits.length;
  const freq = n >= 5 ? 20 : n >= 3 ? 15 : n === 2 ? 10 : n === 1 ? 5 : 0;
  factors.push({
    key: "deposit_frequency",
    label: "Deposit frequency",
    points: freq,
    detail: n === 0 ? "Never funded" : `${n} deposit${n === 1 ? "" : "s"} in total`,
  });

  /* --------------------------------------------------- recent contact (+15) */
  let contact = 0;
  let contactDetail = "No contact logged";
  if (daysSinceContact == null) {
    contact = isNew ? 5 : 0;
    if (isNew) contactDetail = "Newly activated — no contact yet";
  } else if (daysSinceContact <= 7) {
    contact = 15;
    contactDetail = `Spoke ${daysSinceContact === 0 ? "today" : `${daysSinceContact}d ago`}`;
  } else if (daysSinceContact <= 14) {
    contact = 10;
    contactDetail = `Spoke ${daysSinceContact}d ago`;
  } else if (daysSinceContact <= 30) {
    contact = 5;
    contactDetail = `Spoke ${daysSinceContact}d ago`;
  } else {
    contact = 0;
    contactDetail = `Silent for ${daysSinceContact}d`;
  }
  factors.push({ key: "recent_contact", label: "Recent contact", points: contact, detail: contactDetail });

  /* -------------------------------------------------- balance headroom (+15) */
  const potential = potentialValue(input.potentialValue);
  const headroom = potential != null ? Math.max(0, potential - depositTotal) : null;
  const headroomRatio = potential != null && potential > 0 ? (headroom ?? 0) / potential : null;
  let headroomPts = 0;
  let headroomDetail = "No potential value set";
  if (headroomRatio != null) {
    if (headroomRatio >= 0.5) { headroomPts = 15; headroomDetail = "Over half their potential is untapped"; }
    else if (headroomRatio >= 0.25) { headroomPts = 10; headroomDetail = "Room for a meaningful top-up"; }
    else if (headroomRatio > 0) { headroomPts = 5; headroomDetail = "Close to their expected ceiling"; }
    else { headroomPts = 0; headroomDetail = "Fully deposited against potential"; }
  }
  factors.push({ key: "headroom", label: "Balance headroom", points: headroomPts, detail: headroomDetail });

  /* --------------------------------------------------------- KYC status (+15) */
  const kyc = kycStatus(input.kyc);
  const kycPts = kyc === "complete" ? 15 : kyc === "partial" ? 7 : 0;
  factors.push({
    key: "kyc",
    label: "KYC status",
    points: kycPts,
    detail: kyc === "complete" ? "Fully verified" : kyc === "partial" ? "Some documents missing" : "No documents on file",
  });

  /* ------------------------------------------------ withdrawal behaviour (−) */
  const wdRatio = depositTotal > 0 ? withdrawnTotal / depositTotal : withdrawnTotal > 0 ? 1 : 0;
  let wdPts = 0;
  let wdDetail = "No payouts requested";
  if (withdrawnTotal > 0) {
    if (wdRatio >= 0.5) { wdPts = -15; wdDetail = "Withdrew most of what they deposited"; }
    else if (wdRatio >= 0.25) { wdPts = -10; wdDetail = "Pulled out a quarter of their funds"; }
    else { wdPts = -5; wdDetail = "Small payout taken"; }
  }
  factors.push({ key: "withdrawals", label: "Withdrawal behaviour", points: wdPts, detail: wdDetail });

  /* -------------------------------------------------- days since contact (−) */
  let stalePts = 0;
  let staleDetail = "Contact is current";
  if (!isNew) {
    const gap = daysSinceContact ?? ageDays ?? 0;
    if (gap > 60) { stalePts = -10; staleDetail = `${gap}d with no touchpoint`; }
    else if (gap > 30) { stalePts = -7; staleDetail = `${gap}d with no touchpoint`; }
    else if (gap > 14) { stalePts = -3; staleDetail = `${gap}d since the last touchpoint`; }
  } else {
    staleDetail = "Still inside the first two weeks";
  }
  factors.push({ key: "contact_gap", label: "Days since contact", points: stalePts, detail: staleDetail });

  const raw = factors.reduce((a, f) => a + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  /* ------------------------------------------------------------- band */
  let band: HealthBand;
  if (score < 35) band = "critical";
  else if (score < 60) band = "at-risk";
  else band = "healthy";

  // A well-behaved client with real money left on the table is an upsell,
  // not just "fine" — that is the row a manager should call today.
  const upsell =
    band === "healthy" &&
    headroomRatio != null &&
    headroomRatio >= 0.4 &&
    depositTotal > 0 &&
    wdRatio < 0.5;
  if (upsell) band = "upsell";

  /* ----------------------------------------------------------- advice */
  let advice: string;
  if (band === "upsell") {
    advice = `Healthy and still has room — pitch a top-up while they are warm.`;
  } else if (band === "critical") {
    advice = n === 0
      ? "Never funded and going cold. Re-qualify or drop."
      : "Losing them: no recent money and no recent contact. Call today.";
  } else if (band === "at-risk") {
    advice = daysSinceContact != null && daysSinceContact > 14
      ? "Slipping. Reach out before the gap widens."
      : "Momentum is fading — book a next step.";
  } else {
    advice = "In good shape. Keep the contact cadence going.";
  }

  return { score, band, factors, headroom, daysSinceContact, daysSinceDeposit, advice };
}

/** Convenience: colour tone by score alone (badges, sparkbars). */
export function healthTone(score: number): string {
  if (score >= 60) return HEALTH_BAND_TONE.healthy;
  if (score >= 35) return HEALTH_BAND_TONE["at-risk"];
  return HEALTH_BAND_TONE.critical;
}
