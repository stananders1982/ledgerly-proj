import { describe, it, expect } from "vitest";
import {
  depositsByName,
  effectiveBalance,
  qualifiesAsFtd,
  ftdPendingReasons,
  withdrawalPenalty,
  FTD_BALANCE_THRESHOLD,
} from "../rules";
import { commissionRate, commissionAmount } from "../commission";

const tiers = {
  commission_tier1_max: 50000,
  commission_tier1_pct: 8,
  commission_tier2_max: 100000,
  commission_tier2_pct: 10,
  commission_tier3_pct: 12,
};

describe("commission tiers", () => {
  it("uses 8% up to 50k", () => expect(commissionRate(50000, tiers)).toBe(8));
  it("uses 10% up to 100k", () => expect(commissionRate(100000, tiers)).toBe(10));
  it("uses 12% above 100k", () => expect(commissionRate(250001, tiers)).toBe(12));
  it("computes the amount", () => expect(commissionAmount(10000, tiers)).toBe(800));
});

describe("deposits", () => {
  it("sums per normalised name", () => {
    const m = depositsByName([
      { customer_name: " Bob ", amount: 100 },
      { customer_name: "bob", amount: 50 },
      { customer_name: "", amount: 999 },
    ]);
    expect(m.get("bob")).toBe(150);
    expect(m.size).toBe(1);
  });

  it("adds deposits to the base balance", () => {
    const m = depositsByName([{ customer_name: "Ann", amount: 300 }]);
    expect(effectiveBalance({ lead_name: "ann", balance: 250 }, m)).toBe(550);
  });
});

describe("FTD qualification", () => {
  it("requires the lead to have answered", () => {
    expect(qualifiesAsFtd({ answered: false, potential: "high" }, 5000)).toBe(false);
  });
  it("counts answered mid/high potential regardless of balance", () => {
    expect(qualifiesAsFtd({ answered: true, potential: "mid" }, 0)).toBe(true);
  });
  it("counts low potential once the balance clears the threshold", () => {
    expect(qualifiesAsFtd({ answered: true, potential: "low" }, FTD_BALANCE_THRESHOLD)).toBe(true);
    expect(qualifiesAsFtd({ answered: true, potential: "low" }, 250)).toBe(false);
  });
  it("explains why a lead is pending", () => {
    expect(ftdPendingReasons({ answered: false, potential: "low" }, 250)).toEqual([
      "Not answered yet",
      "Low potential and balance under $251",
    ]);
    expect(ftdPendingReasons({ answered: true, potential: "high" }, 0)).toEqual([]);
  });
});

describe("withdrawal penalty", () => {
  it("is 10% of the amount", () => expect(withdrawalPenalty(1000)).toBe(100));
  it("handles empty input", () => expect(withdrawalPenalty(null)).toBe(0));
});
