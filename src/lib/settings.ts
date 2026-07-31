/**
 * Per-company business settings.
 *
 * These used to be hardcoded constants. They now live in `company_settings`
 * (one row per company) so each workspace can tune them without a code change.
 * Defaults match the previous hardcoded values, so nothing shifts on upgrade.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CompanySettings = {
  /** A client only counts as an FTD once the effective balance clears this. */
  ftdBalanceThreshold: number;
  /** Default balance credited when a lead is activated. */
  defaultActivationBalance: number;
  /** Commission paid to the conversion agent for each qualified FTD. */
  ftdCommission: number;
  /** Share of every withdrawal deducted from the responsible agent. */
  withdrawalPenaltyPct: number;
  /** Deposit-method fee deducted before commission is calculated (wire). */
  methodFeeWirePct: number;
  /** Deposit-method fee deducted before commission is calculated (card). */
  methodFeeCardPct: number;
  /** Deposit-method fee deducted before commission is calculated (crypto). */
  methodFeeCryptoPct: number;
};

export const DEFAULT_SETTINGS: CompanySettings = {
  ftdBalanceThreshold: 251,
  defaultActivationBalance: 250,
  ftdCommission: 100,
  withdrawalPenaltyPct: 10,
  methodFeeWirePct: 15,
  methodFeeCardPct: 25,
  methodFeeCryptoPct: 0,
};

type SettingsRow = {
  ftd_balance_threshold: number | string;
  default_activation_balance: number | string;
  ftd_commission: number | string;
  withdrawal_penalty_pct: number | string;
  method_fee_wire_pct: number | string;
  method_fee_card_pct: number | string;
  method_fee_crypto_pct: number | string;
};

export function fromRow(row?: Partial<SettingsRow> | null): CompanySettings {
  if (!row) return DEFAULT_SETTINGS;
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    ftdBalanceThreshold: num(row.ftd_balance_threshold, DEFAULT_SETTINGS.ftdBalanceThreshold),
    defaultActivationBalance: num(row.default_activation_balance, DEFAULT_SETTINGS.defaultActivationBalance),
    ftdCommission: num(row.ftd_commission, DEFAULT_SETTINGS.ftdCommission),
    withdrawalPenaltyPct: num(row.withdrawal_penalty_pct, DEFAULT_SETTINGS.withdrawalPenaltyPct),
    methodFeeWirePct: num(row.method_fee_wire_pct, DEFAULT_SETTINGS.methodFeeWirePct),
    methodFeeCardPct: num(row.method_fee_card_pct, DEFAULT_SETTINGS.methodFeeCardPct),
    methodFeeCryptoPct: num(row.method_fee_crypto_pct, DEFAULT_SETTINGS.methodFeeCryptoPct),
  };
}

export const SETTINGS_QUERY_KEY = ["company-settings"] as const;

/**
 * Current company's settings. Falls back to {@link DEFAULT_SETTINGS} while
 * loading or when no row exists, so callers never have to null-check.
 */
export function useCompanySettings(): CompanySettings {
  const { data } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("ftd_balance_threshold,default_activation_balance,ftd_commission,withdrawal_penalty_pct,method_fee_wire_pct,method_fee_card_pct,method_fee_crypto_pct")
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
  return fromRow(data as SettingsRow | null);
}
