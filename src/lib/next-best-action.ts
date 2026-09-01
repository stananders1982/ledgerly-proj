/**
 * Next Best Action — turns a client's history into one concrete instruction.
 *
 * Health scoring tells you *what* is wrong ("high churn risk"). This layer
 * tells the agent what to *do* about it right now, why, and what to say.
 *
 * Everything here is deterministic and explainable: no model call, just the
 * client's own deposit rhythm, contact log, headroom and compliance state.
 */

import { kycStatus } from "./kyc";
import { potentialValue } from "./whales";

export type NbaUrgency = "now" | "today" | "this-week" | "monitor";

export type NbaChannel = "call" | "whatsapp" | "email";

export type NextBestAction = {
  key: string;
  urgency: NbaUrgency;
  /** Imperative one-liner: "Call John today". */
  headline: string;
  /** Evidence sentences the agent can read out loud. */
  reasons: string[];
  /** Suggested opener / conversation angle based on their history. */
  angle: string;
  /** Channel we recommend first. */
  channel: NbaChannel;
  /** Pre-filled task title. */
  taskTitle: string;
  /** Suggested follow-up date (ISO yyyy-mm-dd). */
  followUp: string;
  /** Supporting numbers for the UI. */
  stats: {
    depositTotal: number;
    depositCount: number;
    daysSinceDeposit: number | null;
    daysSinceContact: number | null;
    avgInterval: number | null;
    overdueBy: number | null;
    headroom: number | null;
  };
};

export type NbaInput = {
  name?: string | null;
  /** Deposits already converted to one display currency. */
  deposits: { date?: string | null; amount: number }[];
  withdrawals: { date?: string | null; amount: number }[];
  contactDates: (string | null | undefined)[];
  kyc?: unknown;
  potentialValue?: unknown;
  activationDate?: string | null;
  nextFollowUp?: string | null;
  answered?: boolean | null;
  phone?: string | null;
  email?: string | null;
  preferredContactTime?: string | null;
  /** Formats money in the viewer's currency. */
  money: (n: number) => string;
  now?: Date;
};

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : null);

function toDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const base = new Date(`${now.toISOString().slice(0, 10)}T00:00:00`).getTime();
  return Math.max(0, Math.round((base - t) / 86400000));
}

function addDays(now: Date, n: number): string {
  const d = new Date(`${now.toISOString().slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function latest(dates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of dates) {
    const d = day(v);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

/** Mean gap in days between consecutive deposits (null with fewer than two). */
export function averageDepositInterval(dates: (string | null | undefined)[]): number | null {
  const ds = dates.map(day).filter(Boolean).sort() as string[];
  if (ds.length < 2) return null;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < ds.length; i++) {
    const a = new Date(`${ds[i - 1]}T00:00:00`).getTime();
    const b = new Date(`${ds[i]}T00:00:00`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    sum += (b - a) / 86400000;
    n++;
  }
  if (!n) return null;
  return Math.max(1, Math.round(sum / n));
}

export function nextBestAction(input: NbaInput): NextBestAction {
  const now = input.now ?? new Date();
  const money = input.money;
  const first = (input.name ?? "").trim().split(/\s+/)[0] || "the client";

  const deposits = (input.deposits ?? []).filter((d) => Number(d.amount) > 0);
  const withdrawals = input.withdrawals ?? [];
  const depositTotal = deposits.reduce((a, d) => a + Number(d.amount || 0), 0);
  const withdrawnTotal = withdrawals.reduce((a, w) => a + Math.abs(Number(w.amount || 0)), 0);
  const depositCount = deposits.length;

  const daysSinceDeposit = toDays(latest(deposits.map((d) => d.date)), now);
  const daysSinceContact = toDays(latest(input.contactDates ?? []), now);
  const daysSinceWithdrawal = toDays(latest(withdrawals.map((w) => w.date)), now);
  const ageDays = toDays(day(input.activationDate), now);
  const avgInterval = averageDepositInterval(deposits.map((d) => d.date));
  const overdueBy =
    avgInterval != null && daysSinceDeposit != null ? daysSinceDeposit - avgInterval : null;

  const potential = potentialValue(input.potentialValue);
  const headroom = potential != null ? Math.max(0, potential - depositTotal) : null;
  const kyc = kycStatus(input.kyc);

  const channel: NbaChannel =
    input.phone ? "call" : input.email ? "email" : "call";
  const bestTime = input.preferredContactTime
    ? ` Best time to reach them: ${input.preferredContactTime}.`
    : "";

  const base = {
    stats: { depositTotal, depositCount, daysSinceDeposit, daysSinceContact, avgInterval, overdueBy, headroom },
  };

  const history =
    depositTotal > 0
      ? `Deposited ${money(depositTotal)} across ${depositCount} deposit${depositCount === 1 ? "" : "s"}.`
      : "No money in yet.";

  /* --------------------------------------------------- 1. rhythm broken */
  if (overdueBy != null && overdueBy >= 2 && depositCount >= 2) {
    return {
      ...base,
      key: "missed-rhythm",
      urgency: overdueBy >= (avgInterval ?? 8) ? "now" : "today",
      headline: `Contact ${first} today`,
      reasons: [
        history,
        `Last deposit was ${daysSinceDeposit} days ago — their average repeat-deposit interval is ${avgInterval} days, so they are ${overdueBy} day${overdueBy === 1 ? "" : "s"} overdue.`,
        daysSinceContact == null
          ? "No contact has ever been logged."
          : `Last touchpoint was ${daysSinceContact} day${daysSinceContact === 1 ? "" : "s"} ago.`,
      ],
      angle: `They fund roughly every ${avgInterval} days and that pattern just broke. Open with a check-in rather than a pitch: "I noticed things have been quiet on your side this week — is everything working as you expected?" Then reference their last deposit of ${money(Number(deposits[deposits.length - 1]?.amount || 0))} and ask what would make the next one comfortable.${bestTime}`,
      channel,
      taskTitle: `Call ${input.name ?? "client"} — ${overdueBy}d past their ${avgInterval}d deposit rhythm`,
      followUp: addDays(now, 2),
    };
  }

  /* ------------------------------------------- 2. money out, no contact */
  if (
    withdrawnTotal > 0 &&
    daysSinceWithdrawal != null &&
    daysSinceWithdrawal <= 14 &&
    (daysSinceContact == null || daysSinceContact > daysSinceWithdrawal)
  ) {
    return {
      ...base,
      key: "post-withdrawal",
      urgency: "now",
      headline: `Call ${first} about their recent payout`,
      reasons: [
        history,
        `They withdrew ${money(withdrawnTotal)} — the most recent payout was ${daysSinceWithdrawal} day${daysSinceWithdrawal === 1 ? "" : "s"} ago.`,
        "No contact has been logged since that payout, which is when clients most often leave quietly.",
      ],
      angle: `Do not treat this as a loss. Confirm the payout landed cleanly, ask what prompted it, and find out whether it was a planned withdrawal or a signal of doubt. If the money was needed elsewhere, agree a date to re-fund; if it was doubt, address it directly before offering anything.${bestTime}`,
      channel,
      taskTitle: `Post-withdrawal call — ${input.name ?? "client"}`,
      followUp: addDays(now, 1),
    };
  }

  /* --------------------------------------------- 3. activated, never funded */
  if (depositCount === 0) {
    const stale = ageDays != null && ageDays > 7;
    return {
      ...base,
      key: "never-funded",
      urgency: stale ? "today" : "this-week",
      headline: `${input.answered === false ? "Keep trying" : "Re-qualify"} ${first}`,
      reasons: [
        "No deposit has ever been recorded for this client.",
        ageDays != null ? `Activated ${ageDays} day${ageDays === 1 ? "" : "s"} ago.` : "Activation date unknown.",
        input.answered === false
          ? "They have never answered — vary the channel and the time of day."
          : daysSinceContact == null
            ? "No contact logged yet."
            : `Last touchpoint was ${daysSinceContact} day${daysSinceContact === 1 ? "" : "s"} ago.`,
      ],
      angle: `Go back to why they signed up in the first place, not to the product. Ask what they were hoping to achieve and what has stopped them so far — then propose a small, specific first step with a date attached instead of an open invitation.${bestTime}`,
      channel: input.answered === false && input.phone ? "whatsapp" : channel,
      taskTitle: `First deposit push — ${input.name ?? "client"}`,
      followUp: addDays(now, 2),
    };
  }

  /* ------------------------------------------------ 4. long silence */
  if ((daysSinceContact == null || daysSinceContact > 21) && (daysSinceDeposit ?? 0) > 21) {
    return {
      ...base,
      key: "gone-quiet",
      urgency: "today",
      headline: `Win ${first} back`,
      reasons: [
        history,
        daysSinceDeposit != null ? `Nothing new for ${daysSinceDeposit} days.` : "No recent deposit.",
        daysSinceContact == null
          ? "No contact has ever been logged."
          : `Silent for ${daysSinceContact} days.`,
      ],
      angle: `A cold client will not respond to a generic follow-up. Lead with something that changed since they were last active, acknowledge the gap honestly ("I owe you a call"), and ask one direct question: are they still interested, yes or no? A clear no is more valuable than another month of silence.${bestTime}`,
      channel,
      taskTitle: `Reactivation attempt — ${input.name ?? "client"}`,
      followUp: addDays(now, 3),
    };
  }

  /* --------------------------------------------------- 5. KYC blocking */
  if (kyc !== "complete" && depositTotal > 0) {
    return {
      ...base,
      key: "kyc",
      urgency: "this-week",
      headline: `Collect ${first}'s missing documents`,
      reasons: [
        history,
        kyc === "partial" ? "KYC is only partly complete." : "No KYC documents are on file.",
        "Incomplete compliance blocks payouts and larger deposits.",
      ],
      angle: `Frame the paperwork as protection, not bureaucracy: complete documents mean faster payouts and higher limits. Ask for one document at a time and offer to walk them through it on the call rather than sending a list by email.${bestTime}`,
      channel: input.email ? "email" : channel,
      taskTitle: `Chase KYC documents — ${input.name ?? "client"}`,
      followUp: addDays(now, 5),
    };
  }

  /* ------------------------------------------------------ 6. upsell */
  if (headroom != null && headroom > 0 && depositTotal > 0 && (daysSinceContact ?? 99) <= 30) {
    return {
      ...base,
      key: "upsell",
      urgency: "this-week",
      headline: `Pitch a top-up to ${first}`,
      reasons: [
        history,
        `Recorded potential is ${money(Number(potential))}, leaving ${money(headroom)} of headroom.`,
        daysSinceContact != null
          ? `You spoke ${daysSinceContact === 0 ? "today" : `${daysSinceContact} day${daysSinceContact === 1 ? "" : "s"} ago`} — they are warm.`
          : "Relationship is active.",
      ],
      angle: `They are performing and still under their ceiling. Anchor on what they have already done — ${money(depositTotal)} in — and propose a specific increment rather than asking "how much more can you add?". Tie it to a goal they have already told you about.${bestTime}`,
      channel,
      taskTitle: `Top-up conversation — ${input.name ?? "client"}`,
      followUp: addDays(now, 7),
    };
  }

  /* ------------------------------------------------------ 7. steady */
  return {
    ...base,
    key: "maintain",
    urgency: "monitor",
    headline: `Keep the cadence with ${first}`,
    reasons: [
      history,
      daysSinceDeposit != null ? `Last deposit ${daysSinceDeposit} day${daysSinceDeposit === 1 ? "" : "s"} ago.` : "No deposit recorded.",
      daysSinceContact != null
        ? `Last touchpoint ${daysSinceContact === 0 ? "today" : `${daysSinceContact} day${daysSinceContact === 1 ? "" : "s"} ago`}.`
        : "No contact logged yet.",
    ],
    angle: `Nothing is broken here. Use the call to gather information rather than to sell: what is working, what they want next, and when they plan to add funds again. Log the answer so the next gap is measurable.${bestTime}`,
    channel,
    taskTitle: `Check-in — ${input.name ?? "client"}`,
    followUp: addDays(now, avgInterval ?? 14),
  };
}

export const NBA_URGENCY_LABEL: Record<NbaUrgency, string> = {
  now: "Act now",
  today: "Today",
  "this-week": "This week",
  monitor: "Monitor",
};

export const NBA_URGENCY_TONE: Record<NbaUrgency, string> = {
  now: "border-rose-500/50 text-rose-600 dark:text-rose-400",
  today: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  "this-week": "border-sky-500/50 text-sky-600 dark:text-sky-400",
  monitor: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
};
