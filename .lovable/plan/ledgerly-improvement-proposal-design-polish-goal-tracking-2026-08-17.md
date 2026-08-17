# Ledgerly improvement proposal — Design polish + Goal tracking

## Scope

A mixed, high-impact pass: visual quick wins across the app, plus one medium feature (goal tracking) that turns existing KPIs into actionable targets without heavy schema changes.

## Track A — Design quick wins

### 1. Consistent empty-state illustrations
Add contextual empty-state illustrations and next-action buttons to every major module (Tasks, Leads, Reports, Revenue, Expenses, Withdrawals). Replace the generic “No results” text with a small icon + clear CTA, e.g. “No tasks yet — Create first task”.

### 2. Smooth page transitions
Add a subtle fade/slide transition between authenticated routes so navigation feels like a single app, not a full page reload.

### 3. Mobile card layout standard
Standardize the mobile card view used in some pages (Leads, Reports) and apply it everywhere. Ensure the first column on every table card is bold and the primary action is thumb-reachable.

### 4. Dashboard bento refinement
Tighten the dashboard grid: group the four main KPIs into a 2×2 bento on desktop, keep the “Since yesterday” and “Ask your data” cards side-by-side, and reduce redundant vertical spacing. Add a small trend arrow icon to each KPI sub-label.

### 5. Color semantic consistency
Ensure every KPI that is good-to-be-high (Revenue, Net Profit, Activation Rate) uses the same green accent, and every cost/expense metric uses the same red accent. Remove accidental color drift between cards.

## Track B — Goal & target tracking

### 6. Goals system
Add a lightweight `goals` table keyed by `entity_type`/`entity_id` and month, with `target_value` and `target_metric`. Support:
- Monthly revenue goal per company.
- Monthly activation/FTD goal per source.
- Monthly deposit/STD goal per retention agent.
- Monthly conversion target per conversion agent.

### 7. Dashboard goal widgets
Add two new dashboard blocks (permission-gated via existing dashboard visibility):
- **Company goals**: progress bar for revenue vs. monthly target, with projected end-of-month based on current run rate.
- **Source goals**: top 3 sources with target activation % vs. actual, plus surplus/deficit indicator.

### 8. Per-employee goals in Performance
On the Performance page, show each agent’s current month against their target, with a small progress bar and a “projected to hit” flag.

## Technical notes

- Empty states and transitions are front-end only; no new tables.
- Goals table uses existing permissions: only admins can set targets, but any user can view goals they have page access to.
- Goal progress uses the same date-range boundaries as the dashboard so numbers stay consistent.
- Add `goals` table with RLS policies and GRANTs, plus a `goal_progress` RPC or computed view.
- Reuse the `useVisibleDashboardSections` hook for the new dashboard blocks.
- Keep the existing green/emerald color token; add a `--goal-track` token if needed for progress bars.

## Outcome

Cleaner, more cohesive visuals across every page, plus a goals layer that turns your dashboard into a forward-looking control center instead of a rear-view mirror.
