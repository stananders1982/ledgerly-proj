import { describe, it, expect } from "vitest";
import {
  stdDepositsFor,
  isStd,
  activationDate,
  normalizeTeam,
  scoresStd,
  type DepositLike,
} from "../rules";

// Pure calculations only — no Supabase, no network.

const client = { id: "act-1", lead_name: "Ann Smith", activation_date: "2026-08-05" };

const dep = (over: Partial<DepositLike> = {}): DepositLike => ({
  id: "r1",
  activation_id: "act-1",
  customer_name: "Ann Smith",
  amount: 500,
  date: "2026-08-10",
  ...over,
});

describe("STD is the second deposit", () => {
  it("takes the first deposit on or after activation, not the FTD balance", () => {
    const stds = stdDepositsFor(client, [
      dep({ id: "before", date: "2026-08-01", amount: 250 }), // pre-activation, ignored
      dep({ id: "std", date: "2026-08-10", amount: 500 }),
      dep({ id: "third", date: "2026-08-20", amount: 900 }),
    ]);
    expect(stds.map((d) => d.id)).toEqual(["std"]);
  });

  it("counts a deposit made on the activation day itself", () => {
    expect(isStd(client, [dep({ date: "2026-08-05" })])).toBe(true);
  });

  it("does not count when the only deposit predates activation", () => {
    expect(isStd(client, [dep({ date: "2026-08-04" })])).toBe(false);
  });

  it("ignores the third and later deposits", () => {
    expect(
      stdDepositsFor(client, [
        dep({ id: "a", date: "2026-08-08" }),
        dep({ id: "b", date: "2026-08-09" }),
        dep({ id: "c", date: "2026-08-11" }),
      ]),
    ).toHaveLength(1);
  });

  it("only matches deposits belonging to that client", () => {
    expect(
      isStd(client, [dep({ activation_id: "act-2", customer_name: "Bob Jones" })]),
    ).toBe(false);
  });

  it("falls back to name matching for legacy unlinked deposits", () => {
    expect(isStd(client, [dep({ activation_id: null, customer_name: " ann smith " })])).toBe(true);
  });
});

describe("STD must land in the activation month", () => {
  it("counts a deposit in the same calendar month", () => {
    expect(isStd(client, [dep({ date: "2026-08-31" })])).toBe(true);
  });

  it("does not count a deposit that slips into the next month", () => {
    expect(isStd(client, [dep({ date: "2026-09-01" })])).toBe(false);
  });

  it("does not count a deposit months later", () => {
    expect(isStd(client, [dep({ date: "2026-12-04" })])).toBe(false);
  });

  it("handles an activation on the last day of the month", () => {
    const lastDay = { id: "act-9", lead_name: "Zoe Ray", activation_date: "2026-08-31" };
    const sameDay = dep({ activation_id: "act-9", customer_name: "Zoe Ray", date: "2026-08-31" });
    const nextDay = dep({ activation_id: "act-9", customer_name: "Zoe Ray", date: "2026-09-01" });
    expect(isStd(lastDay, [sameDay])).toBe(true);
    expect(isStd(lastDay, [nextDay])).toBe(false);
    // The next-day deposit must not push the same-day one out either.
    expect(stdDepositsFor(lastDay, [nextDay, sameDay])).toHaveLength(1);
  });

  it("handles a February activation with no month-length assumptions", () => {
    const feb = { id: "act-2", lead_name: "Ivy Poe", activation_date: "2026-02-27" };
    const d = (date: string) => dep({ activation_id: "act-2", customer_name: "Ivy Poe", date });
    expect(isStd(feb, [d("2026-02-28")])).toBe(true);
    expect(isStd(feb, [d("2026-03-01")])).toBe(false);
  });
});

describe("STD reporting window", () => {
  it("keeps the STD when it falls inside the selected period", () => {
    expect(
      stdDepositsFor(client, [dep({ date: "2026-08-10" })], {
        start: "2026-08-01",
        end: "2026-08-31",
      }),
    ).toHaveLength(1);
  });

  it("drops the STD when it falls outside the selected period", () => {
    expect(
      stdDepositsFor(client, [dep({ date: "2026-08-10" })], {
        start: "2026-08-15",
        end: "2026-08-31",
      }),
    ).toHaveLength(0);
  });
});

describe("activation date resolution", () => {
  it("prefers the activation date, then the lead entry date", () => {
    expect(activationDate({ activation_date: "2026-08-05", entry_date: "2026-04-01" })).toBe(
      "2026-08-05",
    );
    expect(
      activationDate({ activation_date: null, daily_lead_entries: { entry_date: "2026-04-01" } }),
    ).toBe("2026-04-01");
    expect(activationDate({})).toBeNull();
  });

  it("uses the lead entry month when no activation date is recorded", () => {
    const backfilled = { id: "act-3", lead_name: "Ann Smith", entry_date: "2026-04-10" };
    expect(isStd(backfilled, [dep({ activation_id: "act-3", date: "2026-04-20" })])).toBe(true);
    expect(isStd(backfilled, [dep({ activation_id: "act-3", date: "2026-08-20" })])).toBe(false);
  });
});

describe("STD is a retention metric", () => {
  it("is only scored for Team R agents", () => {
    expect(scoresStd("R")).toBe(true);
    expect(scoresStd("r")).toBe(true);
    expect(scoresStd("C")).toBe(false); // conversion agents are scored on FTDs
    expect(scoresStd("M")).toBe(false); // managers are not scored on STDs
  });

  it("treats a missing team as retention, matching the app default", () => {
    expect(normalizeTeam(null)).toBe("R");
    expect(scoresStd(undefined)).toBe(true);
  });

  it("zeroes the STD count for non-retention agents", () => {
    const stds = stdDepositsFor(client, [dep({ date: "2026-08-10" })]).length;
    const scoreFor = (team: string) => (scoresStd(team) ? stds : 0);
    expect(scoreFor("R")).toBe(1);
    expect(scoreFor("C")).toBe(0);
    expect(scoreFor("M")).toBe(0);
  });
});
