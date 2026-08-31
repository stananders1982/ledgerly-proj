/**
 * Anomaly detection.
 *
 * Pure functions: give them raw rows, get back the things that look unusual
 * against the trailing baseline. No network, no React.
 */


import { toBase } from "./fx";
import { getDisplayCurrency } from "./format";
export type AnomalySeverity = "critical" | "warning" | "info";

export interface Anomaly {
  /** Stable id so a dismissal sticks across reloads. */
  id: string;
  title: string;
  detail: string;
  severity: AnomalySeverity;
  to?: string;
}

export interface AnomalyInput {
  revenue: { date: string; amount: number; currency?: string | null; employee_id?: string | null }[];
  expenses: { date: string; amount: number; currency?: string | null; category_id?: string | null }[];
  withdrawals: { date: string; amount: number; currency?: string | null }[];
  activations: {
    activation_date: string | null;
    created_at: string;
    employee_id?: string | null;
    conversion_employee_id?: string | null;
  }[];
  leads: { entry_date: string; received: number; source_id: string | null }[];
  sourcesById: Map<string, string>;
  categoriesById: Map<string, string>;
  employees: { id: string; name: string; active: boolean; team?: string | null }[];
}

const DAY = 24 * 60 * 60 * 1000;

export function daysAgo(n: number, from = new Date()) {
  return new Date(from.getTime() - n * DAY);
}

export function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Daily totals for the `days` days before `endExclusive`. */
function dailyTotals(rows: { date: string; amount: number; currency?: string | null }[], days: number, endExclusive: string) {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.date || r.date >= endExclusive) continue;
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + toDisplay(r.amount, r.currency));
  }
  const out: number[] = [];
  const end = new Date(endExclusive + "T12:00:00");
  for (let i = 1; i <= days; i++) out.push(byDay.get(isoDay(new Date(end.getTime() - i * DAY))) ?? 0);
  return out;
}

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function detectAnomalies(input: AnomalyInput, today = new Date()): Anomaly[] {
  const out: Anomaly[] = [];
  const todayIso = isoDay(today);
  const yesterdayIso = isoDay(daysAgo(1, today));

  // ---- Revenue vs. trailing 30-day baseline -------------------------------
  const revBaseline = dailyTotals(input.revenue, 30, yesterdayIso);
  const revYesterday = input.revenue
    .filter((r) => r.date === yesterdayIso)
    .reduce((s, r) => s + toDisplay(r.amount, r.currency), 0);
  const revMean = mean(revBaseline);
  const revSd = stdev(revBaseline);
  if (revMean > 0 && revSd > 0 && revBaseline.filter(Boolean).length >= 8) {
    const z = (revYesterday - revMean) / revSd;
    if (z >= 2) {
      out.push({
        id: `rev-spike-${yesterdayIso}`,
        severity: "info",
        title: `Deposit spike yesterday — ${money(revYesterday)}`,
        detail: `That is ${z.toFixed(1)}x the usual daily swing (30-day average ${money(revMean)}).`,
        to: "/revenue",
      });
    } else if (z <= -1.8 && revYesterday < revMean * 0.4) {
      out.push({
        id: `rev-drop-${yesterdayIso}`,
        severity: "warning",
        title: "Deposits well below normal yesterday",
        detail: `${money(revYesterday)} against a 30-day average of ${money(revMean)}.`,
        to: "/revenue",
      });
    }
  }

  // ---- Withdrawal surge ---------------------------------------------------
  const wdBaseline = dailyTotals(input.withdrawals, 30, yesterdayIso);
  const wdRecent = input.withdrawals
    .filter((w) => w.date >= isoDay(daysAgo(7, today)) && w.date <= todayIso)
    .reduce((s, w) => s + toDisplay(w.amount, w.currency), 0);
  const wdWeekBaseline = mean(wdBaseline) * 7;
  if (wdWeekBaseline > 0 && wdRecent > wdWeekBaseline * 2) {
    out.push({
      id: `wd-surge-${todayIso.slice(0, 7)}-${Math.round(wdRecent)}`,
      severity: "critical",
      title: "Withdrawals running hot",
      detail: `${money(wdRecent)} withdrawn in the last 7 days vs. a typical ${money(wdWeekBaseline)}.`,
      to: "/withdrawals",
    });
  }

  // ---- A source that stopped delivering -----------------------------------
  const bySource = new Map<string, { recent: number; prior: number }>();
  const start14 = isoDay(daysAgo(14, today));
  const start42 = isoDay(daysAgo(42, today));
  for (const l of input.leads) {
    if (!l.source_id || !l.entry_date) continue;
    const cur = bySource.get(l.source_id) ?? { recent: 0, prior: 0 };
    if (l.entry_date >= start14) cur.recent += Number(l.received || 0);
    else if (l.entry_date >= start42) cur.prior += Number(l.received || 0);
    bySource.set(l.source_id, cur);
  }
  for (const [id, s] of bySource) {
    const priorPerWeek = s.prior / 4;
    if (priorPerWeek >= 5 && s.recent === 0) {
      out.push({
        id: `src-silent-${id}-${start14}`,
        severity: "warning",
        title: `${input.sourcesById.get(id) ?? "A source"} has gone quiet`,
        detail: `No leads in 14 days after averaging ${priorPerWeek.toFixed(0)}/week before that.`,
        to: "/leads",
      });
    }
  }

  // ---- Idle agents, measured per team -------------------------------------
  // Conversion (team C) is judged on activations they converted.
  // Retention (team R) is judged on the clients they hold and the deposits
  // credited to them. Anyone else (managers, other teams) is not an agent and
  // is never flagged here.
  const since = isoDay(daysAgo(14, today));
  const busyConversion = new Set<string>();
  const busyRetention = new Set<string>();
  input.revenue.forEach((r) => {
    if (r.employee_id && r.date >= since) busyRetention.add(r.employee_id);
  });
  input.activations.forEach((a) => {
    const d = a.activation_date ?? a.created_at.slice(0, 10);
    if (d < since) return;
    if (a.conversion_employee_id) busyConversion.add(a.conversion_employee_id);
    if (a.employee_id) busyRetention.add(a.employee_id);
  });

  const teamOf = (e: { team?: string | null }) => (e.team ?? "").trim().toUpperCase();
  const groups: { team: string; label: string; busy: Set<string>; metric: string }[] = [
    { team: "C", label: "conversion", busy: busyConversion, metric: "no activations converted" },
    { team: "R", label: "retention", busy: busyRetention, metric: "no client activity or deposits" },
  ];

  for (const g of groups) {
    const roster = input.employees.filter((e) => e.active && teamOf(e) === g.team);
    const idle = roster.filter((e) => !g.busy.has(e.id));
    if (!idle.length || idle.length >= roster.length) continue;
    out.push({
      id: `idle-${g.team}-${since}-${idle.map((e) => e.id).sort().join("").slice(0, 24)}`,
      severity: "warning",
      title:
        idle.length === 1
          ? `${idle[0].name} (${g.label}) has no activity in 14 days`
          : `${idle.length} of ${roster.length} ${g.label} agents with no activity in 14 days`,
      detail:
        `${g.metric} in the last 14 days: ` +
        idle.map((e) => e.name).slice(0, 6).join(", ") +
        (idle.length > 6 ? ` +${idle.length - 6} more` : ""),
      to: "/performance",
    });
  }

  // ---- Expense far above its category's normal ----------------------------
  const byCat = new Map<string, { date: string; amount: number }[]>();
  for (const e of input.expenses) {
    if (!e.category_id) continue;
    const arr = byCat.get(e.category_id) ?? [];
    arr.push({ date: e.date, amount: toDisplay(e.amount, e.currency) });
    byCat.set(e.category_id, arr);
  }
  const cut = isoDay(daysAgo(14, today));
  for (const [catId, rows] of byCat) {
    if (rows.length < 4) continue;
    const recent = rows.filter((r) => r.date >= cut);
    const history = rows.filter((r) => r.date < cut).map((r) => r.amount);
    if (!recent.length || history.length < 3) continue;
    const hMean = mean(history);
    const worst = recent.reduce((a, b) => (b.amount > a.amount ? b : a));
    if (hMean > 0 && worst.amount > hMean * 2.5) {
      out.push({
        id: `exp-${catId}-${worst.date}-${Math.round(worst.amount)}`,
        severity: "warning",
        title: `Unusual ${input.categoriesById.get(catId) ?? "expense"} charge`,
        detail: `${money(worst.amount)} on ${worst.date} — normally around ${money(hMean)}.`,
        to: "/expenses",
      });
    }
  }

  // ---- Activation drought -------------------------------------------------
  const dateOf = (a: { activation_date: string | null; created_at: string }) =>
    a.activation_date ?? a.created_at.slice(0, 10);
  const actRecent = input.activations.filter((a) => dateOf(a) >= isoDay(daysAgo(7, today))).length;
  const actPrior = input.activations.filter((a) => {
    const d = dateOf(a);
    return d >= isoDay(daysAgo(28, today)) && d < isoDay(daysAgo(7, today));
  }).length;
  const priorWeekly = actPrior / 3;
  if (priorWeekly >= 3 && actRecent < priorWeekly * 0.5) {
    out.push({
      id: `act-drop-${isoDay(daysAgo(7, today))}`,
      severity: "warning",
      title: "Activations down this week",
      detail: `${actRecent} in the last 7 days vs. a typical ${priorWeekly.toFixed(1)}.`,
      to: "/activations",
    });
  }

  const rank: Record<AnomalySeverity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---- Dismissals ------------------------------------------------------------

const DISMISS_KEY = "ledgerly:anomaly-dismissed";

export function readDismissed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function dismissAnomaly(id: string) {
  try {
    const next = [...new Set([...readDismissed(), id])].slice(-200);
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the alert simply reappears */
  }
}
