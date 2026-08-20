import { describe, it, expect } from "vitest";
import {
  weekStartOf,
  weekEndOf,
  weeklyGuarantee,
  sumWeeks,
  deliveryPct,
  mergeWeekRows,
  sourceCost,
  affiliateNet,
  sourceToAffiliate,
  balanceAlert,

  type AffiliateTerms,
} from "../affiliate-balance";

// Pure calculations only — no Supabase, no network.

const aff = (over: Partial<AffiliateTerms> = {}): AffiliateTerms => ({
  id: "a1",
  name: "FTDhubCRG",
  cpa_rate: 250,
  guarantee_value: 20,
  ...over,
});

describe("week windows", () => {
  it("snaps any day to its Monday", () => {
    // 2026-08-07 is a Friday.
    expect(weekStartOf("2026-08-07")).toBe("2026-08-03");
    expect(weekStartOf("2026-08-03")).toBe("2026-08-03");
    // Sunday belongs to the week that started the previous Monday.
    expect(weekStartOf("2026-08-09")).toBe("2026-08-03");
  });

  it("closes the window on Sunday", () => {
    expect(weekEndOf("2026-08-03")).toBe("2026-08-09");
  });
});

describe("weekly guarantee settlement", () => {
  it("settles each Mon–Sun week on its own", () => {
    const rows = weeklyGuarantee(aff(), [
      { entry_date: "2026-08-03", received: 50, reported: 5, activated: 4 },
      { entry_date: "2026-08-09", received: 50, reported: 5, activated: 3 }, // same week (Sunday)
      { entry_date: "2026-08-10", received: 100, reported: 10, activated: 7 }, // next week
    ]);
    expect(rows).toHaveLength(2);

    const w1 = rows.find((r) => r.weekStart === "2026-08-03")!;
    expect(w1.weekEnd).toBe("2026-08-09");
    expect(w1.leads).toBe(100);
    expect(w1.activated).toBe(7);
    expect(w1.guaranteed).toBe(20); // 100 x 20%
    expect(w1.reported).toBe(10);
    expect(w1.payable).toBe(20); // max(reported, guaranteed) — guarantee is a floor
    expect(w1.cost).toBe(5000); // 20 x 250
    expect(w1.shortfall).toBe(10);
    expect(w1.status).toBe("short");

    // Newest week first.
    expect(rows[0]!.weekStart).toBe("2026-08-10");
  });

  it("pays every reported conversion when delivery beats the guarantee", () => {
    const [w] = weeklyGuarantee(aff(), [
      { entry_date: "2026-08-03", received: 100, reported: 30, activated: 25 },
    ]);
    expect(w!.guaranteed).toBe(20);
    expect(w!.activated).toBe(25);
    expect(w!.payable).toBe(30);
    expect(w!.cost).toBe(7500); // all 30 reported are billed
    expect(w!.extra).toBe(10);
    expect(w!.shortfall).toBe(0);
    expect(w!.status).toBe("over");
  });

  it("excludes invalid leads from the guarantee base and percentages", () => {
    const [w] = weeklyGuarantee(aff(), [
      { entry_date: "2026-08-03", received: 120, invalid: 20, reported: 10, activated: 20 },
    ]);
    expect(w!.valid).toBe(100);
    expect(w!.guaranteed).toBe(20); // 100 valid x 20%
    expect(w!.activationPct).toBe(20);
    expect(w!.reportedPct).toBe(10);
  });

  it("marks a week met when reported equals the guarantee", () => {
    const [w] = weeklyGuarantee(aff(), [
      { entry_date: "2026-08-03", received: 100, reported: 20, activated: 18 },
    ]);
    expect(w!.status).toBe("met");
    expect(w!.extra).toBe(0);
    expect(w!.shortfall).toBe(0);
  });

  it("bills every reported conversion when the guarantee is 0% (flat CPA)", () => {
    const [w] = weeklyGuarantee(aff({ guarantee_value: 0, cpa_rate: 300 }), [
      { entry_date: "2026-08-03", received: 40, reported: 7, activated: 10 },
    ]);
    expect(w!.guaranteed).toBe(0);
    expect(w!.activated).toBe(10);
    expect(w!.payable).toBe(7);
    expect(w!.cost).toBe(2100); // 7 x 300
    expect(w!.extra).toBe(0);
    expect(w!.shortfall).toBe(0);
    expect(w!.status).toBe("met");
  });

  it("totals weeks and reports the delivery rate", () => {
    const rows = weeklyGuarantee(aff(), [
      { entry_date: "2026-08-03", received: 100, reported: 10, activated: 8 },
      { entry_date: "2026-08-10", received: 100, reported: 30, activated: 25 },
    ]);
    const t = sumWeeks(rows);
    expect(t.leads).toBe(200);
    expect(t.valid).toBe(200);
    expect(t.activated).toBe(33);
    expect(t.guaranteed).toBe(40);
    expect(t.reported).toBe(40);
    expect(t.payable).toBe(50); // guaranteed 20 + reported 30
    expect(t.cost).toBe(12500);
    expect(t.extra).toBe(10);
    expect(t.shortfall).toBe(10);
    expect(deliveryPct(t)).toBe(100);
    expect(deliveryPct({ reported: 5, guaranteed: 0 })).toBeNull();
  });
});

describe("billing group", () => {
  it("shares one balance across sources with the same group key", () => {
    const crg = aff({ id: "a1", name: "FTDhubCRG", cpa_rate: 250, guarantee_value: 20 });
    const flat = aff({ id: "a2", name: "FTDhub-FLAT", cpa_rate: 200, guarantee_value: 0 });
    const entries = [{ entry_date: "2026-08-03", received: 100, reported: 30, activated: 25 }];

    const merged = mergeWeekRows([
      weeklyGuarantee(crg, entries),
      weeklyGuarantee(flat, entries),
    ]);

    expect(merged).toHaveLength(1); // one shared week, not two rows
    const w = merged[0]!;
    expect(w.leads).toBe(200);
    expect(w.activated).toBe(50);
    expect(w.guaranteed).toBe(20); // only the CRG source guarantees
    expect(w.reported).toBe(60);
    expect(w.cost).toBe(7500 + 6000); // CRG 30 x 250 + flat 30 x 200
    expect(w.extra).toBe(10);
    expect(w.status).toBe("over");
  });


  it("keeps distinct weeks separate when merging", () => {
    const merged = mergeWeekRows([
      weeklyGuarantee(aff(), [{ entry_date: "2026-08-03", received: 10, reported: 2, activated: 1 }]),
      weeklyGuarantee(aff({ id: "a2" }), [{ entry_date: "2026-08-10", received: 10, reported: 2, activated: 1 }]),
    ]);
    expect(merged.map((w) => w.weekStart)).toEqual(["2026-08-10", "2026-08-03"]);
  });
});

describe("pricing models", () => {
  const stats = { leads: 100, activated: 25, reported: 15 };

  it("CPL bills every lead received", () => {
    expect(sourceCost({ pricing_model: "CPL", price: 12 }, stats)).toEqual({
      cost: 1200,
      savings: 0,
    });
  });

  it("CPA bills only reported activations", () => {
    expect(sourceCost({ pricing_model: "CPA", price: 250 }, stats).cost).toBe(3750);
  });

  it("CPA savings are the activations the affiliate never reported", () => {
    // 25 activated - 15 reported = 10 free activations x $250.
    expect(sourceCost({ pricing_model: "CPA", price: 250 }, stats).savings).toBe(2500);
  });

  it("never books negative savings when reporting exceeds activations", () => {
    const r = sourceCost({ pricing_model: "CPA", price: 250 }, { activated: 5, reported: 9 });
    expect(r.savings).toBe(0);
    expect(r.cost).toBe(2250);
  });

  it("defaults to CPL when no model is set", () => {
    expect(sourceCost({ price: 10 }, stats).cost).toBe(1000);
  });
});

describe("net balance", () => {
  it("deducts client withdrawals and payouts from revenue", () => {
    expect(affiliateNet({ revenue: 25000, withdrawals: 4000, paid: 11040 })).toBe(9960);
  });

  it("goes negative when we have paid out more than we took in", () => {
    expect(affiliateNet({ revenue: 1000, withdrawals: 500, paid: 2000 })).toBe(-1500);
  });
});

describe("source to affiliate mapping", () => {
  it("matches by name, case and whitespace insensitive", () => {
    const m = sourceToAffiliate(
      [{ id: "s1", name: " FTDhubCRG " }, { id: "s2", name: "Unknown" }],
      [{ id: "a1", name: "ftdhubcrg" }],
    );
    expect(m.get("s1")).toBe("a1");
    expect(m.has("s2")).toBe(false);
  });
});

describe("balanceAlert", () => {
  const base = { balance_activated_at: "2026-01-01T00:00:00Z", balance_start_date: "2026-01-01" };

  it("stays silent without a threshold", () => {
    expect(balanceAlert({ ...base }, -100)).toBeNull();
  });

  it("stays silent when the balance is far from zero", () => {
    expect(balanceAlert({ ...base, alert_threshold: 1000 }, -5000)).toBeNull();
  });

  it("warns when the credit is nearly used up", () => {
    expect(balanceAlert({ ...base, alert_threshold: 1000 }, -400)?.level).toBe("credit-low");
  });

  it("warns when the balance is owed", () => {
    expect(balanceAlert({ ...base, alert_threshold: 1000 }, 250)?.level).toBe("owing");
  });

  it("stays silent when charging never started", () => {
    expect(balanceAlert({ alert_threshold: 1000 }, 0)).toBeNull();
  });
});
