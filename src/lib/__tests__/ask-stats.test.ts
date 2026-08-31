import { describe, expect, it } from "vitest";
import { computeRates, computeSalesSummary, median, pct, type ClientStat, type SaleRow } from "@/lib/ask-stats";

const client = (over: Partial<ClientStat>): ClientStat => ({
  name: "c",
  tier: "Mid",
  country: "AU",
  conversionAgent: "Cara",
  retentionAgent: "Rita",
  depositCount: 0,
  depositTotal: 0,
  withdrawalCount: 0,
  withdrawalTotal: 0,
  answered: false,
  qualified: false,
  neglected: false,
  activationDate: "2026-08-01",
  ...over,
});

const sale = (over: Partial<SaleRow>): SaleRow => ({
  date: "2026-08-10",
  amount: 100,
  client: "c",
  agent: "Rita",
  source: "KK",
  method: "card",
  currency: "USD",
  ordinal: 1,
  ...over,
});

describe("pct / median", () => {
  it("rounds to one decimal and handles empty", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(0, 0)).toBe(0);
    expect(median([])).toBe(0);
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20])).toBe(15);
  });
});

describe("computeRates", () => {
  const clients = [
    client({ name: "a", depositCount: 3, depositTotal: 900, answered: true, qualified: true }),
    client({ name: "b", depositCount: 2, depositTotal: 400, tier: "Whale" }),
    client({ name: "c", depositCount: 0, neglected: true }),
    client({ name: "d", depositCount: 0, withdrawalCount: 1, withdrawalTotal: 50 }),
  ];
  const r = computeRates(clients, "test");

  it("computes deposit and repeat percentages", () => {
    expect(r.clients).toBe(4);
    expect(r.clientsWhoDeposited).toBe(2);
    expect(r.depositRatePct).toBe(50);
    expect(r.stdRatePct).toBe(50);
    expect(r.stdRateOfDepositorsPct).toBe(100);
    expect(r.repeatRatePct).toBe(25);
    expect(r.withdrawalRatePct).toBe(25);
    expect(r.neglectedRatePct).toBe(25);
  });

  it("averages only over depositing clients", () => {
    expect(r.avgDepositPerDepositingClient).toBe(650);
    expect(r.medianDepositPerDepositingClient).toBe(650);
  });

  it("breaks rates down by tier", () => {
    expect(r.byTier["Whale"]).toEqual({ clients: 1, deposited: 1, pct: 100, deposits: 400 });
  });
});

describe("computeSalesSummary", () => {
  const rows = [
    sale({ client: "a", amount: 500, ordinal: 1 }),
    sale({ client: "a", amount: 300, ordinal: 2, date: "2026-08-20" }),
    sale({ client: "b", amount: 200, ordinal: 1, agent: "Dan", method: "wire" }),
  ];
  const s = computeSalesSummary({
    label: "period",
    start: "2026-08-01",
    end: "2026-08-31",
    rows,
    previousRows: [sale({ amount: 500, date: "2026-07-10" })],
    previousLabel: "july",
    withdrawals: 100,
    expenses: 200,
    monthlyRows: [...rows, sale({ amount: 500, date: "2026-07-10" })],
  });

  it("totals and splits new vs returning money", () => {
    expect(s.totalDeposits).toBe(1000);
    expect(s.depositCount).toBe(3);
    expect(s.uniqueDepositingClients).toBe(2);
    expect(s.newMoney).toEqual({ amount: 700, count: 2 });
    expect(s.secondDeposits).toEqual({ amount: 300, count: 1 });
  });

  it("compares against the previous period and nets out costs", () => {
    expect(s.previousPeriod.changeAmount).toBe(500);
    expect(s.previousPeriod.changePct).toBe(100);
    expect(s.netAfterWithdrawalsAndExpenses).toBe(700);
  });

  it("ranks top clients and months", () => {
    expect(Object.keys(s.topClients)[0]).toBe("a");
    expect(s.bestMonth).toEqual({ month: "2026-08", amount: 1000 });
    expect(s.worstMonth).toEqual({ month: "2026-07", amount: 500 });
  });
});
