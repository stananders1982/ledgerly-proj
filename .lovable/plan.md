# Multi-currency amounts with live exchange rates

Record a deposit (or withdrawal / expense) in AUD, EUR, NZD, GBP, etc. and the app converts it to your workspace currency using the exchange rate at the moment you save it.

## What changes for you

1. **Currency selector next to every amount field** — Record Revenue, Withdrawals and Expenses dialogs get a currency dropdown beside the amount. It defaults to your workspace currency (USD today).
2. **Live conversion preview** — as you type, the dialog shows e.g. `A$1,000 -> $720.00 (1 AUD = 0.7200 USD, live)`. The rate is fetched when you open the dialog and refreshed while typing.
3. **The converted amount is what gets stored and reported.** Every existing KPI, report, commission and balance keeps working unchanged, because they all read the workspace-currency amount.
4. **The moment's rate is locked into the record.** A deposit saved at 0.72 stays at 0.72 forever; a later deposit at 0.77 uses 0.77. No retroactive re-conversion, so historical reports never shift.
5. **Original amount stays visible.** Tables and detail views show the workspace amount, with the original shown underneath / on hover (e.g. "A$1,000 @ 0.7200"). Exports include the original currency, original amount and rate columns.
6. **Fallback if the rate service is unreachable** — the dialog says so and lets you enter the rate manually rather than blocking the save.

## Currencies

USD, EUR, GBP, AUD, NZD, CAD, CHF, JPY, ILS, ZAR, plus any others the rate feed supports. The list is filterable in the dropdown.

## Technical notes

- **Rate source:** a server function `src/lib/fx.functions.ts` calls a free no-key rates API (`open.er-api.com/v6/latest/{base}`, with `frankfurter.app` as fallback) and caches responses in memory for ~10 minutes per base currency. If you later want tick-level accuracy, the same function can swap to a keyed provider by adding one secret — no other code changes.
- **Schema (migration):** add `original_currency text`, `original_amount numeric`, `fx_rate numeric`, `fx_rate_at timestamptz` to `revenue`, `withdrawals` and `expenses`. All nullable — `null` means "already in workspace currency", so all existing rows and API/CSV imports stay valid.
- **Write path:** dialogs keep writing `amount` in workspace currency (`original_amount * fx_rate`, rounded to 2dp) plus the four snapshot columns. Nothing downstream (rules, commissions, balances, reports, Ask-your-data) needs changes.
- **Shared UI:** one `<AmountWithCurrency>` component (input + currency select + live preview) used by all three dialogs, and a `fmtOriginal()` helper in `src/lib/format.ts` for the secondary display.
- **Public API:** `/api/public/v1/deposits` accepts an optional `currency` field and performs the same server-side conversion.
