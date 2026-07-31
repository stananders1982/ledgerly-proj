/**
 * Shared business rules.
 *
 * Every page must import these instead of re-implementing the logic, so that
 * FTD counts, pending counts and balances always agree across the app.
 */

/** A client only counts as an FTD once the effective balance clears this. */
export const FTD_BALANCE_THRESHOLD = 251;

/** Default balance credited when a lead is activated. */
export const DEFAULT_ACTIVATION_BALANCE = 250;

/** Commission paid to the conversion agent for each qualified FTD. */
export const FTD_COMMISSION = 100;

/** Share of every withdrawal deducted from the responsible agent. */
export const WITHDRAWAL_PENALTY_PCT = 10;

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
export function qualifiesAsFtd(row: ActivationLike, balance: number): boolean {
  return (
    !!row.answered &&
    (row.potential === "mid" || row.potential === "high" || balance >= FTD_BALANCE_THRESHOLD)
  );
}

/** Human-readable reasons a lead has not yet become a qualified FTD. */
export function ftdPendingReasons(row: ActivationLike, balance: number): string[] {
  const reasons: string[] = [];
  if (!row.answered) reasons.push("Not answered yet");
  if (
    row.potential !== "mid" &&
    row.potential !== "high" &&
    balance < FTD_BALANCE_THRESHOLD
  ) {
    reasons.push(
      row.potential === "low"
        ? `Low potential and balance under $${FTD_BALANCE_THRESHOLD}`
        : `No potential set and balance under $${FTD_BALANCE_THRESHOLD}`,
    );
  }
  return reasons;
}

/** Single-line variant of {@link ftdPendingReasons}. */
export function ftdPendingReason(row: ActivationLike, balance: number): string {
  return ftdPendingReasons(row, balance).join(" • ") || "Pending";
}

/** Amount deducted from the agent for a given withdrawal amount. */
export function withdrawalPenalty(amount: number | string | null | undefined): number {
  return (Number(amount) || 0) * (WITHDRAWAL_PENALTY_PCT / 100);
}

/** Convenience: evaluate an activation row in one call. */
export function evaluateActivation<T extends ActivationLike>(
  row: T,
  deposits: Map<string, number>,
) {
  const balance = effectiveBalance(row, deposits);
  const qualifies = qualifiesAsFtd(row, balance);
  return {
    row,
    balance,
    qualifies,
    reasons: qualifies ? [] : ftdPendingReasons(row, balance),
  };
}
