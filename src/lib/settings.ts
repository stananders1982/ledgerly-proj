/**
 * Per-company business settings.
 *
 * These used to be hardcoded constants. They now live in `company_settings`
 * (one row per company) so each workspace can tune them without a code change.
 * Defaults match the previous hardcoded values, so nothing shifts on upgrade.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setDisplayCurrency } from "@/lib/format";

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
  /** ISO currency code used across every money figure in the app. */
  currency: string;
  /** Month the fiscal year starts on (1 = January). */
  fiscalYearStartMonth: number;
  /** Hex accent colour applied to the workspace theme. */
  brandColor: string | null;
  /** Optional workspace logo shown in the sidebar. */
  logoUrl: string | null;
};

export const DEFAULT_SETTINGS: CompanySettings = {
  ftdBalanceThreshold: 251,
  defaultActivationBalance: 250,
  ftdCommission: 100,
  withdrawalPenaltyPct: 10,
  methodFeeWirePct: 15,
  methodFeeCardPct: 25,
  methodFeeCryptoPct: 0,
  currency: "USD",
  fiscalYearStartMonth: 1,
  brandColor: null,
  logoUrl: null,
};

type SettingsRow = {
  ftd_balance_threshold: number | string;
  default_activation_balance: number | string;
  ftd_commission: number | string;
  withdrawal_penalty_pct: number | string;
  method_fee_wire_pct: number | string;
  method_fee_card_pct: number | string;
  method_fee_crypto_pct: number | string;
  currency: string | null;
  fiscal_year_start_month: number | string | null;
  brand_color: string | null;
  logo_url: string | null;
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
    currency: (row.currency || DEFAULT_SETTINGS.currency) as string,
    fiscalYearStartMonth: num(row.fiscal_year_start_month, DEFAULT_SETTINGS.fiscalYearStartMonth),
    brandColor: row.brand_color ?? null,
    logoUrl: row.logo_url ?? null,
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
        .select("ftd_balance_threshold,default_activation_balance,ftd_commission,withdrawal_penalty_pct,method_fee_wire_pct,method_fee_card_pct,method_fee_crypto_pct,currency,fiscal_year_start_month,brand_color,logo_url")
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });
  return fromRow(data as SettingsRow | null);
}

/**
 * Applies workspace branding: display currency and accent colour.
 * Mounted once in the authenticated layout.
 */
export function useWorkspaceBranding(): CompanySettings {
  const settings = useCompanySettings();

  useEffect(() => {
    setDisplayCurrency(settings.currency);
  }, [settings.currency]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.brandColor) {
      root.style.setProperty("--primary", settings.brandColor);
      root.style.setProperty("--sidebar-primary", settings.brandColor);
      root.style.setProperty("--ring", settings.brandColor);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--sidebar-primary");
      root.style.removeProperty("--ring");
    }
  }, [settings.brandColor]);

  return settings;
}
