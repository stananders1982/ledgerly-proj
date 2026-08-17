/**
 * Affiliate balance with a weekly conversion guarantee.
 *
 * Every affiliate has an activation price (CPA) and a guaranteed conversion
 * rate. Each Mon–Sun week settles on its own:
 *
 *   guaranteed = leads received x guarantee %  (0% => flat: pay every reported)
 *   payable    = min(reported, guaranteed)
 *   cost       = payable x price
 *   savings    = max(0, reported - guaranteed) x price
 *   shortfall  = max(0, guaranteed - reported)
 *
 * Balance owed = sum(cost) - payments recorded as expenses tagged to the affiliate.
 */

export type AffiliateTerms = {
  id: string;
  name: string;
  active?: boolean;
  cpa_rate?: number | string | null;
  guarantee_value?: number | string | null;
};

export type LeadEntryLike = {
  entry_date: string;
  received?: number | null;
  reported?: number | null;
  activated?: number | null;
  source_id?: string | null;
};

export type WeekRow = {
  weekStart: string;
  weekEnd: string;
  leads: number;
  activated: number;
  guaranteed: number;
  reported: number;
  payable: number;
  cost: number;
  savings: number;
  shortfall: number;
  status: "met" | "short" | "over";
};

/** Monday of the week that contains the given YYYY-MM-DD date. */
export function weekStartOf(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return toIso(d);
}

export function weekEndOf(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return toIso(d);
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Map source_id -> affiliate id, matched by name (lead sources sync to affiliates). */
export function sourceToAffiliate(
  sources: { id: string; name: string }[],
  affiliates: { id: string; name: string }[],
): Map<string, string> {
  const byName = new Map<string, string>();
  for (const a of affiliates) byName.set(a.name.trim().toLowerCase(), a.id);
  const m = new Map<string, string>();
  for (const s of sources) {
    const aff = byName.get(s.name.trim().toLowerCase());
    if (aff) m.set(s.id, aff);
  }
  return m;
}

/** Weekly guarantee settlement rows for one affiliate. */
export function weeklyGuarantee(
  aff: AffiliateTerms,
  entries: LeadEntryLike[],
): WeekRow[] {
  const price = Number(aff.cpa_rate || 0);
  const pct = Number(aff.guarantee_value || 0);

  const buckets = new Map<string, { leads: number; reported: number; activated: number }>();
  for (const e of entries) {
    if (!e.entry_date) continue;
    const k = weekStartOf(e.entry_date);
    const b = buckets.get(k) ?? { leads: 0, reported: 0, activated: 0 };
    b.leads += Number(e.received || 0);
    b.reported += Number(e.reported || 0);
    b.activated += Number(e.activated || 0);
    buckets.set(k, b);
  }

  return [...buckets.entries()]
    .map(([weekStart, b]) => {
      // No guarantee % configured => flat source: pay for every reported conversion.
      const flat = !(pct > 0);
      const guaranteed = flat ? 0 : round2(b.leads * (pct / 100));
      const payable = flat ? b.reported : Math.min(b.reported, guaranteed);
      const cost = round2(payable * price);
      const extra = flat ? 0 : Math.max(0, b.reported - guaranteed);
      const shortfall = flat ? 0 : round2(Math.max(0, guaranteed - b.reported));
      return {
        weekStart,
        weekEnd: weekEndOf(weekStart),
        leads: b.leads,
        activated: b.activated,
        guaranteed,
        reported: b.reported,
        payable: round2(payable),
        cost,
        savings: round2(extra * price),
        shortfall,
        status: flat ? ("met" as const) : extra > 0 ? ("over" as const) : shortfall > 0 ? ("short" as const) : ("met" as const),
      };
    })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function sumWeeks(rows: WeekRow[]) {
  return rows.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      activated: acc.activated + r.activated,
      guaranteed: round2(acc.guaranteed + r.guaranteed),
      reported: acc.reported + r.reported,
      payable: round2(acc.payable + r.payable),
      cost: round2(acc.cost + r.cost),
      savings: round2(acc.savings + r.savings),
      shortfall: round2(acc.shortfall + r.shortfall),
    }),
    { leads: 0, activated: 0, guaranteed: 0, reported: 0, payable: 0, cost: 0, savings: 0, shortfall: 0 },
  );
}

/** Delivery rate: reported conversions as a share of guaranteed conversions. */
export function deliveryPct(totals: { reported: number; guaranteed: number }): number | null {
  if (!totals.guaranteed) return null;
  return round2((totals.reported / totals.guaranteed) * 100);
}

/**
 * Merge weekly settlement rows from every member of a billing group. Members
 * keep their own terms (one flat, one guaranteed); only the money is shared.
 */
export function mergeWeekRows(perMember: WeekRow[][]): WeekRow[] {
  const merged = new Map<string, WeekRow>();
  for (const rows of perMember) {
    for (const w of rows) {
      const prev = merged.get(w.weekStart);
      if (!prev) {
        merged.set(w.weekStart, { ...w });
        continue;
      }
      prev.leads += w.leads;
      prev.guaranteed = round2(prev.guaranteed + w.guaranteed);
      prev.reported += w.reported;
      prev.payable = round2(prev.payable + w.payable);
      prev.cost = round2(prev.cost + w.cost);
      prev.savings = round2(prev.savings + w.savings);
      prev.shortfall = round2(prev.shortfall + w.shortfall);
      prev.status = prev.savings > 0 ? "over" : prev.shortfall > 0 ? "short" : "met";
    }
  }
  return [...merged.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

/** What a source costs us, by pricing model. CPA pays only reported conversions. */
export function sourceCost(
  source: { pricing_model?: string | null; price?: number | string | null },
  stats: { leads?: number; activated?: number; reported?: number },
): { cost: number; savings: number } {
  const price = Number(source.price || 0);
  const leads = Number(stats.leads || 0);
  const activated = Number(stats.activated || 0);
  const reported = Number(stats.reported || 0);
  if ((source.pricing_model ?? "CPL").toUpperCase() === "CPL") {
    return { cost: round2(leads * price), savings: 0 };
  }
  return {
    cost: round2(reported * price),
    savings: round2(Math.max(0, activated - reported) * price),
  };
}

/** Net balance for an affiliate: client deposits less withdrawals and payouts. */
export function affiliateNet(m: { revenue: number; withdrawals: number; paid: number }): number {
  return round2(Number(m.revenue || 0) - Number(m.withdrawals || 0) - Number(m.paid || 0));
}
