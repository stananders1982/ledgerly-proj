/**
 * Pure aggregation helpers for "Ask your data".
 *
 * These pre-compute the percentages and the sales recap so the model never has
 * to count a 250-row client list by hand (and never rounds it wrong).
 * Every amount handed in must already be converted to the workspace currency.
 */

export type ClientStat = {
  name: string;
  tier: string;
  country: string | null;
  conversionAgent: string;
  retentionAgent: string;
  depositCount: number;
  depositTotal: number;
  withdrawalCount: number;
  withdrawalTotal: number;
  answered: boolean;
  qualified: boolean;
  neglected: boolean;
  activationDate: string | null;
};

export type SaleRow = {
  date: string;
  amount: number;
  client: string;
  agent: string;
  source: string;
  method: string;
  currency: string;
  /** 1 = the client's first deposit, 2 = STD, 3+ = later deposits. */
  ordinal: number;
};

export const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

const round = (n: number) => Math.round(n);

export const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

type Bucket = { clients: number; deposited: number; pct: number; deposits: number };

function groupRate(clients: ClientStat[], key: (c: ClientStat) => string | null): Record<string, Bucket> {
  const m = new Map<string, Bucket>();
  for (const c of clients) {
    const k = (key(c) ?? "").trim() || "unspecified";
    const cur = m.get(k) ?? { clients: 0, deposited: 0, pct: 0, deposits: 0 };
    cur.clients += 1;
    if (c.depositCount > 0) cur.deposited += 1;
    cur.deposits += c.depositTotal;
    m.set(k, cur);
  }
  return Object.fromEntries(
    [...m.entries()]
      .sort((a, b) => b[1].clients - a[1].clients)
      .map(([k, v]) => [k, { ...v, deposits: round(v.deposits), pct: pct(v.deposited, v.clients) }]),
  );
}

/** Deposit / answer / retention percentages over a set of clients. */
export function computeRates(clients: ClientStat[], label: string) {
  const total = clients.length;
  const depositors = clients.filter((c) => c.depositCount > 0);
  const std = clients.filter((c) => c.depositCount >= 2);
  const repeat = clients.filter((c) => c.depositCount >= 3);
  const withdrew = clients.filter((c) => c.withdrawalCount > 0);
  const depositTotals = depositors.map((c) => c.depositTotal);
  const depositSum = depositTotals.reduce((s, v) => s + v, 0);

  return {
    label,
    clients: total,
    clientsWhoDeposited: depositors.length,
    depositRatePct: pct(depositors.length, total),
    clientsWith2PlusDeposits: std.length,
    stdRatePct: pct(std.length, total),
    /** Of the clients who deposited at all, how many came back for a second one. */
    stdRateOfDepositorsPct: pct(std.length, depositors.length),
    clientsWith3PlusDeposits: repeat.length,
    repeatRatePct: pct(repeat.length, total),
    answered: clients.filter((c) => c.answered).length,
    answeredRatePct: pct(clients.filter((c) => c.answered).length, total),
    qualifiedFtds: clients.filter((c) => c.qualified).length,
    qualifiedRatePct: pct(clients.filter((c) => c.qualified).length, total),
    neglected: clients.filter((c) => c.neglected).length,
    neglectedRatePct: pct(clients.filter((c) => c.neglected).length, total),
    clientsWhoWithdrew: withdrew.length,
    withdrawalRatePct: pct(withdrew.length, total),
    avgDepositPerDepositingClient: depositors.length ? round(depositSum / depositors.length) : 0,
    medianDepositPerDepositingClient: round(median(depositTotals)),
    avgDepositsPerClient: total ? Math.round((depositors.reduce((s, c) => s + c.depositCount, 0) / total) * 100) / 100 : 0,
    netPerClient: total
      ? round(clients.reduce((s, c) => s + c.depositTotal - c.withdrawalTotal, 0) / total)
      : 0,
    byTier: groupRate(clients, (c) => c.tier),
    byCountry: groupRate(clients, (c) => c.country),
    byConversionAgent: groupRate(clients, (c) => c.conversionAgent),
    byRetentionAgent: groupRate(clients, (c) => c.retentionAgent),
  };
}

function topN(rows: SaleRow[], key: (r: SaleRow) => string, n = 5) {
  const m = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const k = (key(r) ?? "").trim() || "unspecified";
    const cur = m.get(k) ?? { amount: 0, count: 0 };
    cur.amount += r.amount;
    cur.count += 1;
    m.set(k, cur);
  }
  return Object.fromEntries(
    [...m.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, n)
      .map(([k, v]) => [k, { amount: round(v.amount), count: v.count }]),
  );
}

function sum(rows: SaleRow[]) {
  return rows.reduce((s, r) => s + r.amount, 0);
}

/** The recap a manager would write: totals, mix, movement vs the prior period. */
export function computeSalesSummary(opts: {
  label: string;
  start: string;
  end: string;
  rows: SaleRow[];
  previousRows: SaleRow[];
  previousLabel: string;
  withdrawals: number;
  expenses: number;
  monthlyRows: SaleRow[];
}) {
  const { rows, previousRows } = opts;
  const total = sum(rows);
  const prevTotal = sum(previousRows);
  const uniqueClients = new Set(rows.map((r) => r.client.toLowerCase())).size;
  const firstDeposits = rows.filter((r) => r.ordinal === 1);
  const secondDeposits = rows.filter((r) => r.ordinal === 2);
  const laterDeposits = rows.filter((r) => r.ordinal >= 3);
  const largest = rows.reduce<SaleRow | null>((best, r) => (!best || r.amount > best.amount ? r : best), null);

  const byMonth = new Map<string, number>();
  for (const r of opts.monthlyRows) {
    const m = r.date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + r.amount);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[1] - a[1]);

  return {
    label: opts.label,
    period: { start: opts.start, end: opts.end },
    totalDeposits: round(total),
    depositCount: rows.length,
    uniqueDepositingClients: uniqueClients,
    averageTicket: rows.length ? round(total / rows.length) : 0,
    medianTicket: round(median(rows.map((r) => r.amount))),
    largestDeposit: largest ? { client: largest.client, amount: round(largest.amount), date: largest.date } : null,
    newMoney: { amount: round(sum(firstDeposits)), count: firstDeposits.length },
    secondDeposits: { amount: round(sum(secondDeposits)), count: secondDeposits.length },
    returningMoney: { amount: round(sum(laterDeposits)), count: laterDeposits.length },
    previousPeriod: {
      label: opts.previousLabel,
      totalDeposits: round(prevTotal),
      changeAmount: round(total - prevTotal),
      changePct: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 1000) / 10 : null,
    },
    bestMonth: months[0] ? { month: months[0][0], amount: round(months[0][1]) } : null,
    worstMonth: months.length ? { month: months[months.length - 1]![0], amount: round(months[months.length - 1]![1]) } : null,
    topAgents: topN(rows, (r) => r.agent),
    topSources: topN(rows, (r) => r.source),
    topClients: topN(rows, (r) => r.client),
    byMethod: topN(rows, (r) => r.method, 10),
    byOriginalCurrency: topN(rows, (r) => r.currency, 10),
    withdrawals: round(opts.withdrawals),
    expenses: round(opts.expenses),
    netAfterWithdrawalsAndExpenses: round(total - opts.withdrawals - opts.expenses),
  };
}
