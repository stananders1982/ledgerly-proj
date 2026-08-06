/**
 * Source quality intelligence.
 *
 * ROI alone rewards volume. These metrics rank a source on the quality of the
 * money it brings: how fast leads activate, how much each lead is worth, how
 * often clients come back for a second deposit, and how much walks back out.
 */

export interface SqLead {
  source_id: string | null;
  entry_date: string;
  received: number;
  activated: number;
  cost: number;
}

export interface SqActivation {
  lead_name: string | null;
  activation_date: string | null;
  created_at: string;
  source_id: string | null;
  entry_date: string | null;
  qualified_at: string | null;
}

export interface SqRevenue {
  amount: number;
  date: string;
  customer_name: string | null;
}

export interface SqWithdrawal {
  amount: number;
  customer_name: string | null;
}

export interface SourceQualityRow {
  id: string;
  name: string;
  received: number;
  activated: number;
  qualified: number;
  /** Median days between the lead arriving and it activating. */
  timeToActivation: number | null;
  deposits: number;
  depositPerLead: number;
  /** Share of clients from this source that made a second deposit. */
  stdRate: number;
  withdrawn: number;
  /** Withdrawals as a share of deposits. */
  leakRate: number;
  cost: number;
  netProfit: number;
  /** 0-100 composite. Higher is better. */
  score: number;
  /** Point change in score vs. the previous equivalent window. */
  trend: number | null;
}

export interface SourceQualityInput {
  leads: SqLead[];
  activations: SqActivation[];
  revenue: SqRevenue[];
  withdrawals: SqWithdrawal[];
  sources: { id: string; name: string }[];
}

const key = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Computes one window. Pass a previous window to fill in the trend column. */
export function computeSourceQuality(
  input: SourceQualityInput,
  previous?: SourceQualityInput,
): SourceQualityRow[] {
  const rows = computeWindow(input);
  if (!previous) return rows;
  const prev = new Map(computeWindow(previous).map((r) => [r.id, r.score]));
  return rows.map((r) => {
    const before = prev.get(r.id);
    return { ...r, trend: before === undefined ? null : r.score - before };
  });
}

function computeWindow(input: SourceQualityInput): SourceQualityRow[] {
  const { leads, activations, revenue, withdrawals, sources } = input;

  const depositsByClient = new Map<string, { amount: number; date: string }[]>();
  for (const r of revenue) {
    const k = key(r.customer_name);
    if (!k) continue;
    const arr = depositsByClient.get(k) ?? [];
    arr.push({ amount: Number(r.amount || 0), date: r.date });
    depositsByClient.set(k, arr);
  }
  const withdrawnByClient = new Map<string, number>();
  for (const w of withdrawals) {
    const k = key(w.customer_name);
    if (!k) continue;
    withdrawnByClient.set(k, (withdrawnByClient.get(k) ?? 0) + Number(w.amount || 0));
  }

  type Agg = {
    received: number; activated: number; qualified: number; cost: number;
    ttas: number[]; deposits: number; withdrawn: number; clients: number; stds: number;
  };
  const blank = (): Agg => ({
    received: 0, activated: 0, qualified: 0, cost: 0,
    ttas: [], deposits: 0, withdrawn: 0, clients: 0, stds: 0,
  });
  const agg = new Map<string, Agg>();

  for (const l of leads) {
    if (!l.source_id) continue;
    const a = agg.get(l.source_id) ?? blank();
    a.received += Number(l.received || 0);
    a.activated += Number(l.activated || 0);
    a.cost += Number(l.cost || 0);
    agg.set(l.source_id, a);
  }

  for (const act of activations) {
    const sid = act.source_id;
    if (!sid) continue;
    const a = agg.get(sid) ?? blank();
    a.clients += 1;
    if (act.qualified_at) a.qualified += 1;

    const actDate = act.activation_date ?? act.created_at.slice(0, 10);
    if (act.entry_date && actDate) {
      const days = (new Date(actDate).getTime() - new Date(act.entry_date).getTime()) / 86_400_000;
      if (days >= 0 && days < 365) a.ttas.push(days);
    }

    const deps = (depositsByClient.get(key(act.lead_name)) ?? []).sort((x, y) =>
      x.date.localeCompare(y.date),
    );
    a.deposits += deps.reduce((s, d) => s + d.amount, 0);
    a.withdrawn += withdrawnByClient.get(key(act.lead_name)) ?? 0;
    if (deps.filter((d) => !actDate || d.date >= actDate).length >= 2) a.stds += 1;

    agg.set(sid, a);
  }

  const rows: SourceQualityRow[] = [];
  for (const s of sources) {
    const a = agg.get(s.id);
    if (!a || (a.received === 0 && a.clients === 0)) continue;
    const depositPerLead = a.received ? a.deposits / a.received : 0;
    const stdRate = a.clients ? (a.stds / a.clients) * 100 : 0;
    const leakRate = a.deposits ? (a.withdrawn / a.deposits) * 100 : 0;
    const tta = median(a.ttas);

    // Composite: money per lead, repeat behaviour, speed, retention of funds.
    const score = Math.round(
      clamp01(depositPerLead / 400) * 40 +
        clamp01(stdRate / 50) * 25 +
        (tta === null ? 10 : clamp01(1 - tta / 21) * 15) +
        (1 - clamp01(leakRate / 60)) * 20,
    );

    rows.push({
      id: s.id,
      name: s.name,
      received: a.received,
      activated: a.activated,
      qualified: a.qualified,
      timeToActivation: tta === null ? null : Math.round(tta * 10) / 10,
      deposits: a.deposits,
      depositPerLead,
      stdRate,
      withdrawn: a.withdrawn,
      leakRate,
      cost: a.cost,
      netProfit: a.deposits - a.withdrawn - a.cost,
      score,
      trend: null,
    });
  }

  return rows.sort((x, y) => y.score - x.score);
}
