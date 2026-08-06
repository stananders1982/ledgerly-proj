# Brain + UI upgrade — items 2-9, 11-12

Scope approved: Source quality intelligence, Anomaly detection, Smarter forecast, Ask box, Digest, Command-first workflow, Table upgrades, Client drawer, Mobile pass, Visual polish.

## Track A — the brain

**Source quality intelligence**
New scoring per lead source beyond ROI: median time-to-activation, deposit per lead, STD (repeat deposit) rate, withdrawal leak rate, net profit, and a 0-100 composite score with trend vs. the previous window. Shown as a ranked card on the Lead Sources page.

**Anomaly detection & smart alerts**
Compares each day against its own trailing 30-day baseline and flags: deposit spikes/drops, withdrawal surges, a source that stopped sending leads, an active agent with no activity in 14 days, an expense far above its category norm, and activation droughts. Appears as a dismissible alert strip on the dashboard; dismissals stick per browser.

**Forecast that learns**
The 90-day cashflow forecast switches from a flat trailing average to weekday seasonality plus a trend line, adds known recurring expenses and recurring revenue, and shows a confidence band instead of one line.

**Natural-language ask box**
A question field on the dashboard ("how much did KK-Leads make us last month?"). A server function aggregates the company's own data (respecting the asker's permissions), sends the summary to the AI gateway, and returns a short written answer with the numbers it used.

**Daily digest**
A compact "since yesterday" panel: deposits, new FTDs, STDs, withdrawals, expenses logged, and top agent — the things you would otherwise check five pages for.

## Track B — UI/UX

**Command-first workflow**
The command palette gains actions, not just navigation: record deposit, add expense, add lead, new client, new withdrawal, plus jump-to-client search. Enter runs the action on the right page with its dialog already open.

**Table upgrades**
Sticky first column on wide tables, a totals row on numeric columns, and remembered column widths per table.

**Client drawer instead of modal**
The client detail becomes a right-side drawer with previous/next arrows so a retention agent can walk a list without closing and reopening.

**Mobile pass**
Card layouts, larger tap targets, and stacked filters on the pages that still overflow on a phone.

**Visual polish**
Numbers count up on load, consistent empty states with a next action, smoother row and dialog transitions.

## Technical notes

- New pure modules: `src/lib/source-quality.ts`, `src/lib/anomalies.ts`, `src/lib/digest.ts`.
- New components: `anomaly-alerts.tsx`, `daily-digest.tsx`, `ask-box.tsx`, `source-quality-card.tsx`.
- Ask box uses `createServerFn` + the Lovable AI gateway; queries run through the caller's session so row-level rules still apply. No new tables.
- `cashflow-forecast.tsx`, `command-palette.tsx`, `table-toolbox.tsx`, `stat-card.tsx`, `empty-state.tsx` are extended in place.
- Clients page swaps its detail `Dialog` for a `Sheet` and keeps all existing controls.
