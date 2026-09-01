/**
 * Scenario modelling — pure maths so the UI can re-run "what if" instantly.
 *
 * The funnel we model:
 *   leads → activations (activation rate) → FTDs (FTD rate) → revenue (avg deposit)
 *   costs = acquisition (leads × CPL) + fixed operating costs + payouts
 */

export type ScenarioBaseline = {
  /** Leads received in the period. */
  leads: number;
  /** Blended cost per lead (acquisition spend ÷ leads). */
  cpl: number;
  /** Share of leads that get activated, 0–1. */
  activationRate: number;
  /** Share of activated clients that become qualified FTDs, 0–1. */
  ftdRate: number;
  /** Average revenue per FTD. */
  avgFtd: number;
  /** Total revenue booked in the period. */
  revenue: number;
  /** Acquisition spend (lead cost). */
  acquisitionCost: number;
  /** Operating costs that aren't lead acquisition. */
  fixedCosts: number;
  /** Client payouts in the period. */
  withdrawals: number;
  activations: number;
  ftds: number;
  currency: string;
  start: string;
  end: string;
};

export type ScenarioLevers = {
  /** % change in lead volume. */
  leadVolumePct: number;
  /** % change in cost per lead. */
  cplPct: number;
  /** Absolute activation rate, 0–1 (not a delta — easier to reason about). */
  activationRate: number;
  /** Absolute FTD rate, 0–1. */
  ftdRate: number;
  /** % change in the average FTD deposit. */
  avgFtdPct: number;
  /** % change in fixed operating costs. */
  fixedCostsPct: number;
  /** % change in payouts. */
  withdrawalsPct: number;
};

export type ScenarioResult = {
  leads: number;
  cpl: number;
  activationRate: number;
  activations: number;
  ftdRate: number;
  ftds: number;
  avgFtd: number;
  revenue: number;
  acquisitionCost: number;
  fixedCosts: number;
  withdrawals: number;
  profit: number;
  /** Profit per lead — the number that decides whether to buy more traffic. */
  profitPerLead: number;
  /** Revenue ÷ acquisition cost. */
  roas: number;
  /** Acquisition cost per FTD. */
  cpa: number;
};

export const leversFromBaseline = (b: ScenarioBaseline): ScenarioLevers => ({
  leadVolumePct: 0,
  cplPct: 0,
  activationRate: b.activationRate,
  ftdRate: b.ftdRate,
  avgFtdPct: 0,
  fixedCostsPct: 0,
  withdrawalsPct: 0,
});

const pct = (base: number, change: number) => base * (1 + change / 100);

export function runScenario(b: ScenarioBaseline, l: ScenarioLevers): ScenarioResult {
  const leads = Math.max(0, pct(b.leads, l.leadVolumePct));
  const cpl = Math.max(0, pct(b.cpl, l.cplPct));
  const activationRate = Math.max(0, l.activationRate);
  const ftdRate = Math.max(0, l.ftdRate);
  const activations = leads * activationRate;
  const ftds = activations * ftdRate;
  const avgFtd = Math.max(0, pct(b.avgFtd, l.avgFtdPct));
  const revenue = ftds * avgFtd;
  const acquisitionCost = leads * cpl;
  const fixedCosts = Math.max(0, pct(b.fixedCosts, l.fixedCostsPct));
  const withdrawals = Math.max(0, pct(b.withdrawals, l.withdrawalsPct));
  const profit = revenue - acquisitionCost - fixedCosts - withdrawals;
  return {
    leads, cpl, activationRate, activations, ftdRate, ftds, avgFtd,
    revenue, acquisitionCost, fixedCosts, withdrawals, profit,
    profitPerLead: leads ? profit / leads : 0,
    roas: acquisitionCost ? revenue / acquisitionCost : 0,
    cpa: ftds ? acquisitionCost / ftds : 0,
  };
}

/** The baseline expressed through the same result shape, so the table compares like for like. */
export const baselineResult = (b: ScenarioBaseline): ScenarioResult =>
  runScenario(b, leversFromBaseline(b));

export type PresetKey =
  | "cpl-up-15"
  | "activation-down-2"
  | "ftd-up-10"
  | "scale-30"
  | "cut-costs-10";

export const PRESETS: { key: PresetKey; label: string; hint: string; apply: (b: ScenarioBaseline, l: ScenarioLevers) => ScenarioLevers }[] = [
  {
    key: "cpl-up-15",
    label: "CPL +15%",
    hint: "Traffic gets more expensive",
    apply: (_b, l) => ({ ...l, cplPct: 15 }),
  },
  {
    key: "activation-down-2",
    label: "Activation −2pp",
    hint: "Conversion slips (e.g. 8% → 6%)",
    apply: (b, l) => ({ ...l, activationRate: Math.max(0, b.activationRate - 0.02) }),
  },
  {
    key: "ftd-up-10",
    label: "Avg FTD +10%",
    hint: "Bigger first deposits",
    apply: (_b, l) => ({ ...l, avgFtdPct: 10 }),
  },
  {
    key: "scale-30",
    label: "Scale leads +30%",
    hint: "Buy more traffic at +5% CPL",
    apply: (_b, l) => ({ ...l, leadVolumePct: 30, cplPct: 5 }),
  },
  {
    key: "cut-costs-10",
    label: "Cut fixed costs 10%",
    hint: "Trim operating spend",
    apply: (_b, l) => ({ ...l, fixedCostsPct: -10 }),
  },
];
