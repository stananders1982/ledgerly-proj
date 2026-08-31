import { createServerFn } from "@tanstack/react-start";

const SUPPORTED = ["USD", "EUR", "GBP", "AUD", "NZD"] as const;

type CacheEntry = { rates: Record<string, number>; fetchedAt: number };
let cache: CacheEntry | null = null;
const TTL_MS = 10 * 60 * 1000;

/** Normalize a rates map so the key currency = 1. */
function normalize(rates: Record<string, number>, base: string): Record<string, number> {
  const baseRate = rates[base];
  if (!baseRate) return rates;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rates)) out[k] = v / baseRate;
  return out;
}

async function fetchRates(): Promise<CacheEntry> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;

  const wanted = SUPPORTED.join(",");
  // Primary: open.er-api.com (free, no key). Fallback: frankfurter.app.
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const json: any = await res.json();
      const usdBased: Record<string, number> = {};
      for (const c of SUPPORTED) {
        if (typeof json.rates?.[c] === "number") usdBased[c] = json.rates[c];
      }
      // Normalize to each base so callers get "1 X = ? Y" directly for the workspace currency.
      cache = { rates: usdBased, fetchedAt: Date.now() };
      return cache;
    }
  } catch {
    /* fall through to fallback */
  }

  const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${wanted}`);
  if (!res.ok) throw new Error("FX rate service unavailable");
  const json: any = await res.json();
  const usdBased: Record<string, number> = { USD: 1 };
  for (const [k, v] of Object.entries(json.rates ?? {})) usdBased[k] = Number(v);
  cache = { rates: usdBased, fetchedAt: Date.now() };
  return cache;
}

/**
 * Live FX rates, keyed per base currency:
 * `rates["USD"]["AUD"]` = value of 1 AUD in USD.
 */
export const getFxRates = createServerFn({ method: "GET" }).handler(async () => {
  const { rates, fetchedAt } = await fetchRates();
  console.log("[fx] rates:", JSON.stringify(rates));
  const table: Record<string, Record<string, number>> = {};
  for (const base of SUPPORTED) table[base] = normalize(rates, base);
  return {
    table,
    baseRates: rates, // USD-based rates (1 USD = X <currency>)
    fetchedAt,
    currencies: SUPPORTED,
  };
});
