/**
 * Client-side FX conversion. Rates come from `useFxRates()` (which calls the
 * `getFxRates` server function) and are pushed into module state so any
 * non-React helper can convert synchronously.
 */
import { useQuery } from "@tanstack/react-query";
import { getFxRates } from "@/lib/fx.functions";
import { getWorkspaceCurrency, getDisplayCurrency } from "@/lib/format";

export const FX_CURRENCIES = ["USD", "EUR", "GBP", "AUD", "NZD"] as const;
export type FxCurrency = (typeof FX_CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  NZD: "NZ$",
};

/** baseRates: USD-based — 1 USD = X <currency>. Defaults to identity. */
let baseRates: Record<string, number> = { USD: 1, EUR: 1, GBP: 1, AUD: 1, NZD: 1 };
let ratesFetchedAt = 0;
let fallbackUsed = false;

export const setFxRates = (rates: Record<string, number>, fetchedAt: number) => {
  baseRates = { ...rates };
  ratesFetchedAt = fetchedAt;
  fallbackUsed = Date.now() - fetchedAt > 15 * 60_000;
};

export const getFxFetchedAt = () => ratesFetchedAt;
export const fxRateIsStale = () => fallbackUsed;

/** 1 <currency> = ? <base> (base defaults to the workspace display currency). */
export function fxRate(currency: string | null | undefined, base: string): number {
  if (!currency || currency === base) return 1;
  const r = baseRates[currency];
  const b = baseRates[base];
  if (!r || !b) return 1;
  return b / r;
}

/** Convert an amount stored in its original currency into the base currency. */
export function toBase(amount: number | string | null | undefined, currency: string | null | undefined, base: string): number {
  const a = Number(amount) || 0;
  return a * fxRate(currency, base);
}

/**
 * Convert an amount into the current display currency. Rows with no currency
 * are stored in the workspace currency, so NULL is treated as such — unlike
 * `toBase`, which skips conversion for null currencies.
 */
export function toDisplay(amount: number | string | null | undefined, currency: string | null | undefined): number {
  return toBase(amount, currency ?? getWorkspaceCurrency(), getDisplayCurrency());
}

/** Convert a value known to be denominated in the workspace currency (salaries, count×price lead costs) into the display currency. */
export function fromWorkspace(amount: number | null | undefined): number {
  return toBase(amount, getWorkspaceCurrency(), getDisplayCurrency());
}

/** Convenience for summing mixed-currency rows into the base currency. */
export function sumBase<T>(rows: T[], base: string, pick: (r: T) => { amount: any; currency?: string | null }): number {
  return rows.reduce((s, r) => {
    const { amount, currency } = pick(r);
    return s + toBase(amount, currency, base);
  }, 0);
}

/** Format a small amount with 2 decimals in a given currency (for previews). */
export const fmtPrecise = (n: number, currency: string) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });

/** Original-currency secondary label, e.g. "A$1,000". Null when base currency. */
export const originalLabel = (amount: any, currency: string | null | undefined, base: string): string | null => {
  if (!currency || currency === base) return null;
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${sym}${(Number(amount) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};

export const FX_QUERY_KEY = ["fx-rates"] as const;

/** Loads live rates once per session and publishes them to the module state. */
export function useFxRates() {
  const q = useQuery({
    queryKey: FX_QUERY_KEY,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: () => getFxRates(),
  });

  // Publish fetched rates before consumers calculate during this render.
  // An effect runs too late: currency-dependent memos can otherwise cache the
  // initial 1:1 fallback and only update their symbol, not their value.
  if (q.data && q.data.fetchedAt > ratesFetchedAt) {
    setFxRates(q.data.baseRates, q.data.fetchedAt);
  }

  return {
    rates: q.data?.baseRates ?? baseRates,
    currencies: (q.data?.currencies ?? FX_CURRENCIES) as readonly string[],
    fetchedAt: q.data?.fetchedAt ?? ratesFetchedAt,
    loading: q.isLoading,
    error: q.isError,
  };
}
