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

/**
 * Deposit-method fees deducted before commission is calculated.
 * Wire -15%, Card -25%, Crypto -0%.
 */
export const METHOD_FEE_PCT: Record<string, number> = {
  wire: 15,
  card: 25,
  crypto: 0,
};

export function methodFeePct(method?: string | null): number {
  if (!method) return 0;
  return METHOD_FEE_PCT[String(method).toLowerCase()] ?? 0;
}

/** Revenue amount that commission is calculated on, after the method fee. */
export function commissionableAmount(amount: number | string | null | undefined, method?: string | null): number {
  const a = Number(amount) || 0;
  return a * (1 - methodFeePct(method) / 100);
}
