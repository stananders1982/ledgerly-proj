const SUPPORTED = ["USD", "EUR", "GBP", "AUD", "NZD"] as const;

type CacheEntry = { rates: Record<string, number>; fetchedAt: number };
let cache: CacheEntry | null = null;
const TTL_MS = 10 * 60 * 1000;

function normalize(rates: Record<string, number>, base: string): Record<string, number> {
  const baseRate = rates[base];
  if (!baseRate) return rates;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(rates)) out[key] = value / baseRate;
  return out;
}

async function fetchRates(): Promise<CacheEntry> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (response.ok) {
      const json = await response.json() as { rates?: Record<string, number> };
      const rates: Record<string, number> = {};
      for (const currency of SUPPORTED) {
        const rate = json.rates?.[currency];
        if (typeof rate === "number") rates[currency] = rate;
      }
      cache = { rates, fetchedAt: Date.now() };
      return cache;
    }
  } catch {
    // Use the fallback provider below.
  }

  const wanted = SUPPORTED.join(",");
  const response = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${wanted}`);
  if (!response.ok) throw new Error("FX rate service unavailable");
  const json = await response.json() as { rates?: Record<string, number> };
  const rates: Record<string, number> = { USD: 1 };
  for (const [currency, rate] of Object.entries(json.rates ?? {})) rates[currency] = Number(rate);
  cache = { rates, fetchedAt: Date.now() };
  return cache;
}

export async function loadFxRates() {
  const { rates, fetchedAt } = await fetchRates();
  const table: Record<string, Record<string, number>> = {};
  for (const base of SUPPORTED) table[base] = normalize(rates, base);
  return { table, baseRates: rates, fetchedAt, currencies: SUPPORTED };
}