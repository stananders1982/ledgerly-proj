I reviewed the routes, shared libs, and the live database. Here's what I found and what I'd fix, in priority order.

## 1. Silent data truncation (highest risk, verified)

The backend returns at most 1000 rows per query, and almost no page sets an explicit range — only Revenue and Logs do. Current row counts: attendance 405, activations 158, revenue 86, withdrawals 51. Attendance alone grows ~420 rows/month with 19 employees, so it crosses 1000 in roughly two months and reports will silently start showing wrong totals with no error.

Fix:
- Add a shared paged-fetch helper that loops `range()` until all rows are read, and use it for every aggregate query (Dashboard, Reports, Leads, Clients, Attendance, Performance, Affiliate statements).
- Tighten date filters where a query currently pulls the whole table (Reports pulls all revenue for player-value, all employees, all sources).

## 2. Business rules are duplicated instead of shared

The FTD qualification rule (`answered AND (mid/high potential OR effective balance >= 251)`) is re-implemented in at least four files: Clients, Employee detail, Performance, and the pending dialog. The same is true for effective-balance (base + deposits), the 10% withdrawal penalty, the $100 FTD commission, and the 8/10/12% tiers.

Fix: move all of it into `src/lib/rules.ts` (`effectiveBalance`, `qualifiesAsFtd`, `ftdReason`, `withdrawalPenalty`) and have every page import it. This is the root cause of the recurring "numbers don't match between pages" issues.

## 3. Constants should be settings, not literals

`251`, `10%` withdrawal penalty, `$100` FTD bonus and the `$250` default balance are hardcoded in the UI. Add a `company_settings` table (one row per company) plus a small Settings page so the owner can change these per company without a code change. Defaults keep today's values, so nothing shifts.

## 4. Reports page is a 1,126-line monolith

It runs 13 queries on every visit regardless of which tab is open. Split each tab into its own component file and make its query lazy (only fetch when the tab is active). Big load-time win on the heaviest page.

## 5. Data integrity

Client identity is matched by `lead_name` string in several places (deposits, STD, player value). Renaming or a typo silently splits a client's history. Add a proper `activation_id` link on revenue/withdrawals where it's still name-based, with a one-time backfill by exact name match.

## 6. UX and polish

- Dashboard: add a "compare to previous period" delta on the hero KPIs.
- Global: keyboard shortcut hints in the command palette, and remembering the last selected date range per user.
- Clients: bulk actions (mark answered, set potential) for several rows at once.
- Reports: saved report presets (filters + date range) per user.
- Attendance: an at-a-glance monthly grid per employee instead of one day at a time.

## 7. Operational

- No automated tests exist. Add a small vitest suite for `commission.ts` and the new `rules.ts` — those are the money-critical functions.
- Add DB indexes on the columns every report filters by (`revenue.date`, `expenses.date`, `withdrawals.date`, `attendance.date`, `daily_lead_activations.entry_id`), scoped by `company_id`.

## Suggested order

1. Paged fetch helper + explicit ranges (correctness)
2. Shared `rules.ts` + replace duplicates (consistency)
3. Indexes + Reports tab splitting (performance)
4. Settings table & page (flexibility)
5. Activation ID linking + backfill (integrity)
6. UX items and tests

Tell me which of these you want and I'll start with that subset — or say "all" and I'll go through them in the order above.
