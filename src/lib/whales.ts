/**
 * Whale helpers.
 *
 * A "whale" is a client whose recorded potential value (how much money we
 * realistically believe they can put in) reaches the company whale threshold.
 * A "neglected whale" is a whale that, in the 14 days after their FTD /
 * activation date, neither deposited nor was contacted.
 */

export const NEGLECT_WINDOW_DAYS = 14;

export function potentialValue(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isWhale(v: unknown, threshold: number): boolean {
  const n = potentialValue(v);
  return n != null && n >= threshold;
}

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
 * True when the client is a whale and, within the 14 days following their
 * activation, we recorded no deposit AND no contact.
 */
export function isNeglectedWhale(input: NeglectInput, threshold: number): boolean {
  if (!isWhale(input.potentialValue, threshold)) return false;
  const start = day(input.startDate);
  const end = neglectWindowEnd(start);
  if (!start || !end) return false;
  const inWindow = (v?: string | null) => {
    const d = day(v);
    return !!d && d >= start && d <= end;
  };
  if (input.depositDates.some(inWindow)) return false;
  if (input.contactDates.some(inWindow)) return false;
  return true;
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
