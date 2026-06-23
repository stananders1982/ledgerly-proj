export type CommissionTiers = {
  commission_tier1_max: number;
  commission_tier1_pct: number;
  commission_tier2_max: number;
  commission_tier2_pct: number;
  commission_tier3_pct: number;
};

/**
 * Flat-by-bracket commission: the entire monthly revenue is multiplied by the
 * rate of the bracket it falls into.
 */
export function commissionRate(monthlyRevenue: number, t: CommissionTiers): number {
  const r = Number(monthlyRevenue) || 0;
  if (r <= Number(t.commission_tier1_max)) return Number(t.commission_tier1_pct) || 0;
  if (r <= Number(t.commission_tier2_max)) return Number(t.commission_tier2_pct) || 0;
  return Number(t.commission_tier3_pct) || 0;
}

export function commissionAmount(monthlyRevenue: number, t: CommissionTiers): number {
  const r = Number(monthlyRevenue) || 0;
  return r * (commissionRate(r, t) / 100);
}
