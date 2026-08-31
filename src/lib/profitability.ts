/**
 * Money truth: processing fees and per-client profitability.
 *
 * Every page that shows "what did we actually make" must import from here so
 * the same number appears on the dashboard, the reports and the client page.
 */

import { DEFAULT_SETTINGS, type CompanySettings } from "./settings";
import { toDisplay, fromWorkspace } from "./fx";
import { commissionAmount, methodFeePct, type CommissionTiers } from "./commission";
import { nameKey } from "./rules";

/* ------------------------------------------------------------------ */
/* Processing fees                                                     */
/* ------------------------------------------------------------------ */

export type MethodKey = "wire" | "card" | "crypto";

export const DEPOSIT_METHODS: { value: MethodKey; label: string }[] = [
  { value: "wire", label: "Wire" },
  { value: "card", label: "Card" },
  { value: "crypto", label: "Crypto" },
];

export { methodFeePct };


export type FeeRow = {
  amount?: number | string | null;
  currency?: string | null;
  method?: string | null;
  fee_pct?: number | string | null;
  fee_amount?: number | string | null;
};

/**
 * Fee for a deposit, in display currency. Prefers the fee stored on the row
 * (what was actually charged) and falls back to the configured method rate for
 * historic rows recorded before fees were tracked.
 */
export function depositFee(row: FeeRow, settings: CompanySettings = DEFAULT_SETTINGS): number {
  const stored = Number(row.fee_amount ?? 0);
  if (Number.isFinite(stored) && stored > 0) return toDisplay(stored, row.currency ?? null);
  const pct = Number(row.fee_pct ?? 0) || methodFeePct(row.method, settings);
  if (!pct) return 0;
  return toDisplay(Number(row.amount ?? 0) * (pct / 100), row.currency ?? null);
}

/** Gross deposit value in display currency. */
export const depositGross = (row: FeeRow): number => toDisplay(row.amount, row.currency ?? null);

/** What actually reaches the bank: gross minus the processing fee. */
export function depositNet(row: FeeRow, settings: CompanySettings = DEFAULT_SETTINGS): number {
  return depositGross(row) - depositFee(row, settings);
}

/** Totals across a batch of deposits. */
export function feeTotals(rows: FeeRow[], settings: CompanySettings = DEFAULT_SETTINGS) {
  let gross = 0;
  let fees = 0;
  for (const r of rows) {
    gross += depositGross(r);
    fees += depositFee(r, settings);
  }
  return { gross, fees, net: gross - fees };
}

/* ------------------------------------------------------------------ */
/* Per-client profitability                                            */
/* ------------------------------------------------------------------ */

export type ProfitClient = {
  id?: string | null;
  lead_name?: string | null;
  employee_id?: string | null;
  conversion_employee_id?: string | null;
  entry_id?: string | null;
};

export type ProfitDeposit = FeeRow & {
  activation_id?: string | null;
  customer_name?: string | null;
  employee_id?: string | null;
  employee_id_2?: string | null;
  split_pct?: number | string | null;
};

export type ProfitWithdrawal = {
  activation_id?: string | null;
  customer_name?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  revenue_id?: string | null;
  status?: string | null;
};

export type ClientProfit = {
  gross: number;
  fees: number;
  net: number;
  withdrawals: number;
  leadCost: number;
  commission: number;
  profit: number;
};

const EMPTY_PROFIT: ClientProfit = {
  gross: 0,
  fees: 0,
  net: 0,
  withdrawals: 0,
  leadCost: 0,
  commission: 0,
  profit: 0,
};

/** True when a transaction row belongs to this client. */
function belongs(
  row: { activation_id?: string | null; customer_name?: string | null },
  client: ProfitClient,
): boolean {
  if (row.activation_id) return !!client.id && row.activation_id === client.id;
  const k = nameKey(client.lead_name);
  return !!k && nameKey(row.customer_name) === k;
}

export type ProfitInputs = {
  deposits: ProfitDeposit[];
  withdrawals: ProfitWithdrawal[];
  /** Acquisition cost attributed to this one client, in workspace currency. */
  leadCost?: number;
  /** Commission tiers of the agent(s) credited with this client's deposits. */
  tiersFor?: (employeeId: string | null | undefined) => CommissionTiers | null;
  settings?: CompanySettings;
};

/**
 * Full P&L for one client: what they deposited, what we paid to get and keep
 * them, and what is left.
 */
export function clientProfit(client: ProfitClient, input: ProfitInputs): ClientProfit {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const mine = input.deposits.filter((d) => belongs(d, client));
  if (!mine.length && !input.leadCost) {
    const wOnly = input.withdrawals.filter((w) => belongs(w, client));
    if (!wOnly.length) return { ...EMPTY_PROFIT };
  }

  const { gross, fees, net } = feeTotals(mine, settings);

  const withdrawals = input.withdrawals
    .filter((w) => belongs(w, client) && String(w.status ?? "paid") !== "rejected")
    .reduce((s, w) => s + toDisplay(w.amount, w.currency ?? null), 0);

  let commission = 0;
  if (input.tiersFor) {
    for (const d of mine) {
      const value = depositNet(d, settings);
      const split = Number(d.split_pct ?? 100);
      const parts: [string | null | undefined, number][] = d.employee_id_2
        ? [
            [d.employee_id, split / 100],
            [d.employee_id_2, 1 - split / 100],
          ]
        : [[d.employee_id ?? client.employee_id, 1]];
      for (const [empId, share] of parts) {
        const tiers = input.tiersFor(empId);
        if (!tiers) continue;
        commission += commissionAmount(value * share, tiers);
      }
    }
  }

  const leadCost = fromWorkspace(input.leadCost ?? 0);
  const profit = net - withdrawals - leadCost - commission;
  return { gross, fees, net, withdrawals, leadCost, commission, profit };
}

/**
 * Acquisition cost per activated client for a lead entry: the entry's total
 * cost spread over the clients it produced.
 */
export function leadCostPerClient(entry?: {
  cost?: number | string | null;
  activated?: number | string | null;
} | null): number {
  if (!entry) return 0;
  const cost = Number(entry.cost ?? 0);
  const n = Number(entry.activated ?? 0);
  if (!cost || !n) return 0;
  return cost / n;
}

/** Build entry_id -> per-client acquisition cost. */
export function leadCostIndex(
  entries: { id: string; cost?: number | string | null; activated?: number | string | null }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.id, leadCostPerClient(e));
  return m;
}

/* ------------------------------------------------------------------ */
/* Cash runway                                                         */
/* ------------------------------------------------------------------ */

export type RunwayInput = {
  /** Net cash on hand: net deposits minus withdrawals minus costs, all-time. */
  cashPosition: number;
  /** Average total monthly outflow (expenses + recurring + lead cost + payroll). */
  monthlyBurn: number;
};

export type Runway = { months: number | null; cashPosition: number; monthlyBurn: number };

/** Months of runway; null when there is no burn (infinite) or no cash. */
export function cashRunway({ cashPosition, monthlyBurn }: RunwayInput): Runway {
  if (!monthlyBurn || monthlyBurn <= 0) return { months: null, cashPosition, monthlyBurn };
  return { months: cashPosition / monthlyBurn, cashPosition, monthlyBurn };
}
