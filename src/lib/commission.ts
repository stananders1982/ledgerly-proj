import { DEFAULT_SETTINGS, type CompanySettings } from "./settings";

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
 * Default deposit-method fees deducted before commission is calculated.
 * Wire -15%, Card -25%, Crypto -0%.
 */
export const DEFAULT_METHOD_FEE_PCT: Record<string, number> = {
  wire: 15,
  card: 25,
  crypto: 0,
};

function feesFromSettings(settings?: CompanySettings): Record<string, number> {
  if (!settings) return DEFAULT_METHOD_FEE_PCT;
  return {
    wire: settings.methodFeeWirePct,
    card: settings.methodFeeCardPct,
    crypto: settings.methodFeeCryptoPct,
  };
}

export function methodFeePct(method?: string | null, settings?: CompanySettings): number {
  if (!method) return 0;
  return feesFromSettings(settings)[String(method).toLowerCase()] ?? 0;
}

/** Revenue amount that commission is calculated on, after the method fee. */
export function commissionableAmount(
  amount: number | string | null | undefined,
  method?: string | null,
  settings?: CompanySettings,
): number {
  const a = Number(amount) || 0;
  return a * (1 - methodFeePct(method, settings) / 100);
}
