# Multi-currency amounts, always shown at today's live rate

Record a deposit (or withdrawal / expense) in AUD, EUR, NZD, GBP, etc. The entry keeps its original currency, and everywhere in the app it is shown in your workspace currency using the **current** exchange rate — so a 1,000 AUD deposit shows as $720 today and $770 if the rate moves to 0.77.

## What changes for you

1. **Currency selector next to every amount field** — Record Revenue, Withdrawals and Expenses dialogs get a currency dropdown beside the amount. It defaults to your workspace currency (USD today).
2. **Live conversion preview** — as you type, the dialog shows e.g. `A$1,000 = $720.00 (1 AUD = 0.7200 USD, live)`.
3. **Nothing is locked in.** The record stores the amount in its original currency. Every table, KPI, report, commission and balance converts on the fly with the latest rate, so all figures move with the market.
4. **Original amount stays visible.** Tables show the converted workspace amount, with the original underneath (e.g. "A$1,000"). Exports include original currency, original amount, converted amount and the rate used at export time.
5. **Fallback if the rate service is unreachable** — the app uses the last known cached rate and marks the figure as "rate from <time>", rather than showing wrong or blank numbers.

## Currencies

USD, EUR, GBP, AUD, NZD. The dropdown is searchable.

## Technical notes

- **Rate source:** server function `src/lib/fx.functions.ts` calls a free no-key rates API (`open.er-api.com/v6/latest/{base}`, `frankfurter.app` as fallback), cached in memory ~10 minutes. Swapping to a keyed real-time provider later is a one-file change plus a secret.
- **Client-side rate table:** a `useFxRates()` hook (TanStack Query, 10-minute stale time, refetch on focus) loads `{ USD: 1, AUD: 0.72, ... }` once per session and shares it app-wide via a small `fx` module.
- **Schema (migration):** add `currency text` to `revenue`, `withdrawals` and `expenses`, nullable — `null` means the amount is already in workspace currency, so all existing rows, CSV imports and API posts stay valid. `amount` keeps its original-currency value; no data backfill.
- **Conversion layer:** a single `toBase(amount, currency, rates)` helper in `src/lib/fx.ts`. Every place that currently sums `Number(r.amount)` — dashboard, reports, performance, clients, affiliate balances, commissions, Ask-your-data — is switched to `toBase(...)` so all aggregates are consistent.
- **Formatting:** `fmtMoney` stays as-is for base-currency values; a new `fmtOriginal(amount, currency)` renders the secondary original-currency line.
- **Public API:** `/api/public/v1/deposits` accepts an optional `currency` field and stores it as-is; reporting endpoints return both the original and the live-converted value.
