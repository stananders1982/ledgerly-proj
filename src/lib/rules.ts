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

export type DepositIndex = {
  /** Deposits linked directly to a client record (preferred). */
  byActivation: Map<string, number>;
  /** Legacy deposits with no client link, matched by name only. */
  byName: Map<string, number>;
};

/**
 * Index deposits by activation id first, keeping a name-keyed bucket only for
 * legacy rows that were never linked — so nothing is counted twice.
 */
export function depositIndex(
  rows: {
    activation_id?: string | null;
    customer_name?: string | null;
    amount?: number | string | null;
  }[],
): DepositIndex {
  const byActivation = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const r of rows) {
    const amt = Number(r.amount || 0);
    if (r.activation_id) {
      byActivation.set(r.activation_id, (byActivation.get(r.activation_id) ?? 0) + amt);
      continue;
    }
    const k = nameKey(r.customer_name);
    if (!k) continue;
    byName.set(k, (byName.get(k) ?? 0) + amt);
  }
  return { byActivation, byName };
}

/** Total deposits for a client, preferring the direct link over the name. */
export function depositTotalFor(
  row: { id?: string | null; lead_name?: string | null },
  index: DepositIndex,
): number {
  const linked = row.id ? (index.byActivation.get(row.id) ?? 0) : 0;
  const legacy = index.byName.get(nameKey(row.lead_name)) ?? 0;
  return linked + legacy;
}

/** Base balance plus every deposit recorded for that client name. */
export function effectiveBalance(row: ActivationLike, deposits: Map<string, number>): number {
  return Number(row.balance || 0) + (deposits.get(nameKey(row.lead_name)) ?? 0);
}

/** Balance using the activation-first deposit index. */
export function effectiveBalanceIndexed(
  row: ActivationLike & { id?: string | null },
  index: DepositIndex,
): number {
  return Number(row.balance || 0) + depositTotalFor(row, index);
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
 * STD rule: the activation balance is the FTD, so the *second* deposit — the
 * first one recorded on or after the activation date — is the STD, and it only
 * counts when it lands in the same calendar month as the activation.
 * Later deposits (3rd, 4th, ...) are ignored.
 * Optionally restrict to an STD dated inside a window (YYYY-MM-DD strings).
 */
export function stdDepositsFor<T extends DepositLike>(
  row: ActivationDatedLike,
  deposits: T[],
  window?: { start?: string; end?: string },
): T[] {
  const act = activationDate(row);
  const matches = deposits
    .filter((d) => !!d.date && (!act || d.date! >= act) && depositMatchesActivation(d, row))
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
  const second = matches[0];
  if (!second) return [];
  // Must be in the same calendar month as the activation (FTD).
  if (act && second.date!.slice(0, 7) !== act.slice(0, 7)) return [];
  if (window?.start && second.date! < window.start) return [];
  if (window?.end && second.date! > window.end) return [];
  return [second];
}

/** True when the client has a qualifying second deposit. */
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

/* ------------------------------------------------------------------ */
/* Teams                                                               */
/* ------------------------------------------------------------------ */

/** Team code for an employee: R = retention, C = conversion, M = manager. */
export function normalizeTeam(team?: string | null): string {
  return String(team ?? "R").toUpperCase();
}

/** STD is a retention metric — only Team R agents are scored on it. */
export function scoresStd(team?: string | null): boolean {
  return normalizeTeam(team) === "R";
}

/**
 * Teams that are scored as agents. Managers (M) are excluded from every
 * performance, ranking, commission and financial-report view — they still
 * appear in the roster, on their own detail page, and as a fixed salary cost.
 */
export const AGENT_TEAMS = ["C", "R"] as const;

/** True when the employee belongs to a scored agent team (C or R). */
export function isAgentTeam(team?: string | null): boolean {
  return (AGENT_TEAMS as readonly string[]).includes(normalizeTeam(team));
}

/** True when the employee is a manager (Team M). */
export function isManagerTeam(team?: string | null): boolean {
  return normalizeTeam(team) === "M";
}
