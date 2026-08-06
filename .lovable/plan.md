# Next Improvements — Brain + UI

Two tracks. Pick any subset; each item is independent.

## Track A — The "brain" (smarter data, less manual work)

1. **Agent coaching insights**
   On each employee page, auto-generated observations comparing the agent to their own last 3 months and to the team median: conversion rate, STD rate, average deposit size, answer rate. Written as plain sentences ("STD rate dropped from 31% to 18% while clients received went up 40%").

2. **Source quality intelligence**
   Beyond ROI: time-to-activation, deposit-per-lead, STD rate and refund/withdrawal rate per source. Ranks sources on *profit quality*, not volume, and flags sources whose quality is degrading month over month.

3. **Anomaly detection & smart alerts**
   Daily check for statistical outliers: revenue spike/drop vs. the trailing 30-day baseline, a source that stopped delivering, an agent with zero activity, withdrawal surge, expense above the usual range for its category. Shown as dismissible alerts and in the notification bell.

4. **Forecast that learns**
   Replace the flat 90-day cashflow projection with one based on trailing conversion rates, seasonality by weekday, recurring expenses/revenue, and pipeline (unqualified activations weighted by their qualification probability).

5. **Natural-language ask box**
   A single input on the dashboard ("how much did Team C earn from KK-Leads last month?") that turns the question into a scoped query over the existing data and answers with a number plus a small table. Uses the built-in AI gateway, read-only, permission-scoped.

6. **Daily / weekly digest**
   An auto-generated morning summary: yesterday's FTDs, STDs, deposits, unallocated clients, tasks due, anomalies. Viewable in-app; optionally emailed.

## Track B — UI and everyday usability

7. **Command-first workflow**
   Extend the command palette to actions, not just navigation: "record deposit", "add client", "mark absent", jump to any client/employee by name from anywhere.

8. **Table upgrades**
   Sticky header + sticky first column on wide tables, column resize and reorder, per-user persisted layouts, inline edit for the few fields that change constantly (balance, potential, answered, agent), and a footer row with column totals.

9. **Client drawer instead of modal**
    A side drawer with tabs (Overview / Deposits / Withdrawals / Timeline / Tasks / Files) that can stay open while you move down the list, plus prev/next arrows to walk records without closing.

10. **Dashboard you can arrange**
    Drag-to-reorder cards, hide the ones a given role never uses, and a compact "TV mode" for a wall screen showing today's FTDs, deposits and team leaderboard.

11. **Mobile pass**
    The core daily flows — record deposit, mark attendance, check today's numbers, update client status — as proper mobile layouts with card lists rather than horizontally scrolling tables.

12. **Visual polish**
    Consistent empty states with a primary action, skeletons everywhere instead of blank flashes, subtle transitions on row expand/drawer open, number roll-ups on KPI cards, and colour-coded deltas that read the same in light and dark mode.

13. **Bulk everything**
    Multi-select on Clients and Revenue with bulk assign agent, bulk tag, bulk set potential, bulk export selection.

## Technical notes

- Items 1, 3, 5 are pure derived-data work in `src/lib` (new `forecast.ts`) plus presentation — no schema change.
- Items 2, 4, 6 need a small `insights_snapshots` (or equivalent) table so daily baselines and dismissals persist; alerts reuse the existing `notifications` table.
- Item 5 uses a server function with the Lovable AI gateway; it must map the question onto a fixed set of allowed aggregations and re-check the caller's permissions before returning rows.
- Items 7-13 are frontend only: `table-toolbox.tsx`, `command-palette.tsx`, `stat-card.tsx`, and the route files already carry most of the structure needed.

## Suggested first slice

If you want one high-value batch: **3 (anomaly alerts), 8 (table upgrades), 9 (client drawer)** — the ones that change how the day is run and remove the most friction from the screens you use most.
