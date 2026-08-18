# Reports page: make the important numbers obvious

Today the Report Center opens on a wall of 15 equal tabs and an Executive tab that is 12 identical grey stat boxes. Nothing tells you what is good, bad, or trending. This reworks the page so the answer is visible in the first screen, and the deep tables stay one click away.

## 1. A real Executive overview (default view)

Replace the 12 flat cards with a scannable layout:

- **Headline strip (4 cards)** — Net Profit, Revenue, Total Costs, Profit Margin. Each shows the value plus a comparison vs. the previous equal-length period (e.g. "+18% vs previous 30 days"), coloured green/red.
- **Profit breakdown bar** — one horizontal stacked bar: Revenue split into Marketing/CPL/CPA, Salaries, Commissions, Other expenses, and the remaining Profit. Instantly shows where the money goes.
- **Funnel line** — Leads → Activated → Reported → Deposits, as a compact 4-step bar with the conversion % between each step (uses the real numbers already computed; drops the current fake "Contacted 80% / Qualified 50%" estimates).
- **Trend chart** — daily Revenue vs. Costs over the selected period, with a cumulative profit line.
- **Efficiency row** — CPL, CPA, Revenue per Activation, CPA Savings, each with the period-over-period arrow.
- **Attention list** — 3-5 auto-generated one-liners from the same data: biggest source by ROI, worst source by ROI, unreported activations worth $X, expense category that jumped, agent with the best/worst activation rate. Each links to the matching tab.

## 2. Group the 15 tabs

Keep every existing report, but organise the tab bar so it is not a flat wall:

```text
Overview | Money (P&L · Revenue · Expenses · Recurring · Forecast)
         | Acquisition (Lead Sources · Marketing · CPA Savings · Funnel · Player Value)
         | People (Employees · Attendance) | Partners (Affiliate Payouts) | Audit
```

Top row = 6 groups; selecting a group shows its sub-reports as a light second row. Deep links and export behaviour stay the same.

## 3. Readability inside the tables

- Money columns right-aligned and monospaced; negative values red.
- Totals row on every report table.
- ROI / activation-rate / margin cells get a subtle inline bar so outliers pop.
- Empty period shows "No data for this range" with a button to widen to last 30 days, instead of a blank table.

## 4. Period comparison toggle

One "Compare to previous period" switch next to the date range. When on, the Overview cards and the P&L show a second column with the prior period and the delta.

## Technical notes

- All work stays in `src/routes/_authenticated/reports.tsx` plus small new presentational components (`report-kpi.tsx`, `report-breakdown-bar.tsx`) under `src/components/`. No schema or business-logic changes.
- The comparison period is a second set of the existing queries with a shifted `start`/`end`, keyed separately in React Query, only fetched when the compare toggle is on.
- Charts use the recharts setup already used by the dashboard sparklines.
- Tab grouping is presentational: the underlying `tab` state values stay unchanged, so saved presets keep working.
