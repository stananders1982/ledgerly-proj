import { describe, it, expect } from "vitest";
import {
  computeSourceQuality,
  type SourceQualityInput,
  type SqLead,
  type SqActivation,
} from "../source-quality";

// Pure calculations only — no Supabase, no network.

const lead = (over: Partial<SqLead> = {}): SqLead => ({
  source_id: "s1",
  entry_date: "2026-08-01",
  received: 10,
  activated: 4,
  cost: 500,
  ...over,
});

const act = (over: Partial<SqActivation> = {}): SqActivation => ({
  lead_name: "Ann Smith",
  activation_date: "2026-08-05",
  created_at: "2026-08-05T10:00:00Z",
  source_id: "s1",
  entry_date: "2026-08-01",
  qualified_at: "2026-08-06",
  ...over,
});

const input = (over: Partial<SourceQualityInput> = {}): SourceQualityInput => ({
  leads: [lead()],
  activations: [act()],
  revenue: [],
  withdrawals: [],
  sources: [{ id: "s1", name: "KK-Leads" }],
  ...over,
});

describe("composite quality score", () => {
  it("scores a perfect source at 100", () => {
    // $400+/lead, 50%+ STD rate, same-day activation, zero withdrawals.
    const [row] = computeSourceQuality(
      input({
        leads: [lead({ received: 1, activated: 1 })],
        activations: [act({ activation_date: "2026-08-01" })],
        revenue: [
          { amount: 200, date: "2026-08-01", customer_name: "Ann Smith" },
          { amount: 300, date: "2026-08-02", customer_name: "Ann Smith" },
        ],
      }),
    );
    expect(row!.depositPerLead).toBe(500);
    expect(row!.stdRate).toBe(100);
    expect(row!.timeToActivation).toBe(0);
    expect(row!.leakRate).toBe(0);
    expect(row!.score).toBe(100);
  });

  it("scores a source with no money and no repeat behaviour at its floor", () => {
    // 0 deposits => 0 money points, 0 STD points, 0 leak => full 20 retention
    // points, plus speed points for a 4-day activation.
    const [row] = computeSourceQuality(input());
    expect(row!.deposits).toBe(0);
    expect(row!.stdRate).toBe(0);
    expect(row!.timeToActivation).toBe(4);
    expect(row!.score).toBe(Math.round((1 - 4 / 21) * 15 + 20));
  });

  it("gives a neutral speed allowance when time to activation is unknown", () => {
    const [row] = computeSourceQuality(
      input({ activations: [act({ entry_date: null, activation_date: null })] }),
    );
    expect(row!.timeToActivation).toBeNull();
    expect(row!.score).toBe(30); // 10 neutral speed points + 20 retention points
  });

  it("penalises leakage when clients withdraw their deposits", () => {
    const clean = computeSourceQuality(
      input({ revenue: [{ amount: 1000, date: "2026-08-06", customer_name: "Ann Smith" }] }),
    )[0]!;
    const leaky = computeSourceQuality(
      input({
        revenue: [{ amount: 1000, date: "2026-08-06", customer_name: "Ann Smith" }],
        withdrawals: [{ amount: 600, customer_name: "Ann Smith" }],
      }),
    )[0]!;
    expect(leaky.leakRate).toBe(60);
    expect(leaky.score).toBeLessThan(clean.score);
    expect(leaky.netProfit).toBe(1000 - 600 - 500);
  });

  it("uses the median when several leads activate at different speeds", () => {
    const [row] = computeSourceQuality(
      input({
        activations: [
          act({ lead_name: "A", activation_date: "2026-08-02" }), // 1 day
          act({ lead_name: "B", activation_date: "2026-08-06" }), // 5 days
          act({ lead_name: "C", activation_date: "2026-08-10" }), // 9 days
        ],
      }),
    );
    expect(row!.timeToActivation).toBe(5);
  });
});

describe("rolling window scoring", () => {
  it("reports the point change against the previous window", () => {
    const current = input({
      revenue: [{ amount: 4000, date: "2026-08-06", customer_name: "Ann Smith" }],
    });
    const previous = input({ revenue: [] });
    const [row] = computeSourceQuality(current, previous);
    const base = computeSourceQuality(previous)[0]!;
    const now = computeSourceQuality(current)[0]!;
    expect(row!.trend).toBe(now.score - base.score);
    expect(row!.trend).toBeGreaterThan(0);
  });

  it("leaves the trend null when there is no previous window", () => {
    expect(computeSourceQuality(input())[0]!.trend).toBeNull();
  });

  it("leaves the trend null for a source that is new this window", () => {
    const previous = input({
      leads: [lead({ source_id: "s2" })],
      activations: [act({ source_id: "s2" })],
      sources: [{ id: "s2", name: "Naffitive" }],
    });
    const [row] = computeSourceQuality(input(), previous);
    expect(row!.id).toBe("s1");
    expect(row!.trend).toBeNull();
  });
});

describe("ranking", () => {
  it("orders sources by score, highest first", () => {
    const rows = computeSourceQuality({
      leads: [lead({ source_id: "s1" }), lead({ source_id: "s2" })],
      activations: [
        act({ source_id: "s1", lead_name: "Ann Smith" }),
        act({ source_id: "s2", lead_name: "Bob Jones" }),
      ],
      revenue: [{ amount: 5000, date: "2026-08-06", customer_name: "Bob Jones" }],
      withdrawals: [],
      sources: [
        { id: "s1", name: "KK-Leads" },
        { id: "s2", name: "Naffitive" },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["s2", "s1"]);
    expect(rows[0]!.score).toBeGreaterThan(rows[1]!.score);
  });

  it("keeps both sources when scores tie", () => {
    const rows = computeSourceQuality({
      leads: [lead({ source_id: "s1" }), lead({ source_id: "s2" })],
      activations: [
        act({ source_id: "s1", lead_name: "Ann Smith" }),
        act({ source_id: "s2", lead_name: "Bob Jones" }),
      ],
      revenue: [],
      withdrawals: [],
      sources: [
        { id: "s1", name: "KK-Leads" },
        { id: "s2", name: "Naffitive" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.score).toBe(rows[1]!.score);
    // A stable sort keeps the input order for equal scores.
    expect(rows.map((r) => r.id)).toEqual(["s1", "s2"]);
  });
});

describe("edge cases", () => {
  it("drops sources with no leads and no clients", () => {
    const rows = computeSourceQuality(
      input({
        sources: [
          { id: "s1", name: "KK-Leads" },
          { id: "s9", name: "Dormant source" },
        ],
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(["s1"]);
  });

  it("keeps a source with zero leads but activated clients, without dividing by zero", () => {
    const [row] = computeSourceQuality(
      input({
        leads: [lead({ received: 0, activated: 0, cost: 0 })],
        revenue: [{ amount: 900, date: "2026-08-06", customer_name: "Ann Smith" }],
      }),
    );
    expect(row!.received).toBe(0);
    expect(row!.depositPerLead).toBe(0);
    expect(Number.isFinite(row!.score)).toBe(true);
  });

  it("ignores leads and activations with no source", () => {
    const rows = computeSourceQuality(
      input({
        leads: [lead({ source_id: null })],
        activations: [act({ source_id: null })],
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it("handles a window with no data at all", () => {
    expect(
      computeSourceQuality({
        leads: [],
        activations: [],
        revenue: [],
        withdrawals: [],
        sources: [{ id: "s1", name: "KK-Leads" }],
      }),
    ).toEqual([]);
  });
});
