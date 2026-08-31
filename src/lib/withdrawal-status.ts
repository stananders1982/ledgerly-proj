/**
 * Withdrawal payout lifecycle: requested -> processing -> paid (or rejected).
 * Pending payouts are aged against the workspace SLA so nobody waits silently.
 */
import { DEFAULT_SETTINGS, type CompanySettings } from "./settings";

export const WITHDRAWAL_STATUSES = ["requested", "processing", "paid", "rejected"] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

export const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
};

export const WITHDRAWAL_STATUS_TONE: Record<string, string> = {
  requested: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  processing: "border-sky-500/50 text-sky-600 dark:text-sky-400",
  paid: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  rejected: "border-muted-foreground/40 text-muted-foreground",
};

export type WithdrawalRow = {
  status?: string | null;
  requested_at?: string | null;
  date?: string | null;
};

/** Still owed to the client. */
export const isPendingPayout = (w: WithdrawalRow): boolean =>
  w.status === "requested" || w.status === "processing";

/** Days a pending payout has been waiting (null when not pending). */
export function payoutAgeDays(w: WithdrawalRow, today = new Date()): number | null {
  if (!isPendingPayout(w)) return null;
  const from = w.requested_at ?? w.date;
  if (!from) return null;
  const t = new Date(`${String(from).slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((today.getTime() - t) / 86_400_000));
}

/** Waiting longer than the workspace allows. */
export function isOverduePayout(
  w: WithdrawalRow,
  settings: CompanySettings = DEFAULT_SETTINGS,
  today = new Date(),
): boolean {
  const age = payoutAgeDays(w, today);
  return age !== null && age > settings.withdrawalSlaDays;
}
