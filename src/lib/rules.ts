/**
 * Shared business rules.
 *
 * Every page must import these instead of re-implementing the logic, so that
 * FTD counts, pending counts and balances always agree across the app.
 */

import { DEFAULT_SETTINGS, type CompanySettings } from "./settings";

/**
 * These are the platform defaults. Prefer `useCompanySettings()` in pages and
 * pass the result in — every rule below accepts an optional settings object.
 */
export const FTD_BALANCE_THRESHOLD = DEFAULT_SETTINGS.ftdBalanceThreshold;
export const DEFAULT_ACTIVATION_BALANCE = DEFAULT_SETTINGS.defaultActivationBalance;
export const FTD_COMMISSION = DEFAULT_SETTINGS.ftdCommission;
export const WITHDRAWAL_PENALTY_PCT = DEFAULT_SETTINGS.withdrawalPenaltyPct;

export type PotentialValue = "low" | "mid" | "high" | null | undefined;

export type ActivationLike = {
  lead_name?: string | null;
  balance?: number | string | null;
  potential?: PotentialValue;
  answered?: boolean | null;
};

/** Normalised key used to match a client by name across tables. */
export function nameKey(name?: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

/** Build a name -> total deposits map from revenue rows. */
export function depositsByName(
  rows: { customer_name?: string | null; amount?: number | string | null }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = nameKey(r.customer_name);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + Number(r.amount || 0));
  }
  return m;
}

/** Base balance plus every deposit recorded for that client name. */
export function effectiveBalance(row: ActivationLike, deposits: Map<string, number>): number {
  return Number(row.balance || 0) + (deposits.get(nameKey(row.lead_name)) ?? 0);
}

/**
 * FTD rule: the lead must have answered, and either be mid/high potential or
 * have deposited beyond the default activation balance.
 */
export function qualifiesAsFtd(
  row: ActivationLike,
  balance: number,
  settings: CompanySettings = DEFAULT_SETTINGS,
): boolean {
  return (
    !!row.answered &&
    (row.potential === "mid" || row.potential === "high" || balance >= settings.ftdBalanceThreshold)
  );
}

/** Human-readable reasons a lead has not yet become a qualified FTD. */
export function ftdPendingReasons(
  row: ActivationLike,
  balance: number,
  settings: CompanySettings = DEFAULT_SETTINGS,
): string[] {
  const reasons: string[] = [];
  const threshold = settings.ftdBalanceThreshold;
  if (!row.answered) reasons.push("Not answered yet");
  if (row.potential !== "mid" && row.potential !== "high" && balance < threshold) {
    reasons.push(
      row.potential === "low"
        ? `Low potential and balance under $${threshold}`
        : `No potential set and balance under $${threshold}`,
    );
  }
  return reasons;
}

/** Single-line variant of {@link ftdPendingReasons}. */
export function ftdPendingReason(
  row: ActivationLike,
  balance: number,
  settings: CompanySettings = DEFAULT_SETTINGS,
): string {
  return ftdPendingReasons(row, balance, settings).join(" • ") || "Pending";
}

/** Amount deducted from the agent for a given withdrawal amount. */
export function withdrawalPenalty(
  amount: number | string | null | undefined,
  settings: CompanySettings = DEFAULT_SETTINGS,
): number {
  return (Number(amount) || 0) * (settings.withdrawalPenaltyPct / 100);
}

/** Convenience: evaluate an activation row in one call. */
export function evaluateActivation<T extends ActivationLike>(
  row: T,
  deposits: Map<string, number>,
  settings: CompanySettings = DEFAULT_SETTINGS,
) {
  const balance = effectiveBalance(row, deposits);
  const qualifies = qualifiesAsFtd(row, balance, settings);
  return {
    row,
    balance,
    qualifies,
    reasons: qualifies ? [] : ftdPendingReasons(row, balance, settings),
  };
}

/* ------------------------------------------------------------------ */
/* STD (Second Time Deposit)                                           */
/* ------------------------------------------------------------------ */

export type ActivationDatedLike = {
  id?: string | null;
  lead_name?: string | null;
  activation_date?: string | null;
  daily_lead_entries?: { entry_date?: string | null } | null;
  entry_date?: string | null;
};

export type DepositLike = {
  id?: string | null;
  activation_id?: string | null;
  customer_name?: string | null;
  amount?: number | string | null;
  date?: string | null;
};

/** Date the lead was actually activated (falls back to the lead entry date). */
export function activationDate(row: ActivationDatedLike): string | null {
  return row.activation_date ?? row.daily_lead_entries?.entry_date ?? row.entry_date ?? null;
}

/** True when this revenue row belongs to the given activation. */
export function depositMatchesActivation(dep: DepositLike, row: ActivationDatedLike): boolean {
  if (dep.activation_id) return !!row.id && dep.activation_id === row.id;
  const k = nameKey(row.lead_name);
  return !!k && nameKey(dep.customer_name) === k;
}

/**
 * STD rule: the activation balance is the FTD, so every recorded deposit made
 * on or after the activation date counts as a second-time deposit.
 * Optionally restrict to deposits inside a date window (YYYY-MM-DD strings).
 */
export function stdDepositsFor<T extends DepositLike>(
  row: ActivationDatedLike,
  deposits: T[],
  window?: { start?: string; end?: string },
): T[] {
  const act = activationDate(row);
  return deposits.filter((d) => {
    if (!d.date) return false;
    if (act && d.date < act) return false;
    if (window?.start && d.date < window.start) return false;
    if (window?.end && d.date > window.end) return false;
    return depositMatchesActivation(d, row);
  });
}

/** True when the client has at least one qualifying second deposit. */
export function isStd(
  row: ActivationDatedLike,
  deposits: DepositLike[],
  window?: { start?: string; end?: string },
): boolean {
  return stdDepositsFor(row, deposits, window).length > 0;
}

/** YYYY-MM-DD in local time, for comparing against date columns. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
