# Flag late FTDs that qualified through a retention deposit

## The situation

A low-potential client is activated, sits pending, and only becomes a valid FTD when retention gets a deposit that pushes the balance over the threshold. That can be months later, and the conversion agent gets the FTD (and commission) in the month it qualified. Today the lists only show a small "(late)" note next to the qualified date on some pages, so it is not obvious which of an agent's FTDs came in this way.

## What changes

1. **A clear label.** Any FTD where the client was low / no potential and only qualified after its activation month gets a badge: **"Late FTD - retention deposit"** (short form "Late (retention)"), with a tooltip showing the activation date, the qualification date, and how many months apart they are.
2. **Where the badge appears**
   - Clients page (Activations) table - replaces the plain "(late)" note.
   - Employee page, conversion FTDs list.
   - Conversions by agent - the FTD drill-down list on the Leads page and the dashboard scoreboard.
   - Performance page FTD drill-down list.
3. **A count everywhere FTDs are reported.** Alongside the FTD number, agents get a secondary figure "of which X late (retention)":
   - Conversions by agent leaderboard.
   - Performance page - new sortable "Late FTDs" column.
   - Reports - Employees report gets a "Late FTDs" column, and the Funnel report gets a "Late FTDs" line so the split is visible in the period totals.
   - Employee page FTD card shows the late share.
4. **Exports.** CSV/Excel exports of clients, performance and the employees report gain a `Late FTD` column (yes/no or count) so the split is auditable.
5. **No change to counting or commission.** Late FTDs still count for the conversion agent in the month they qualified, exactly as now. This is labelling and reporting only.

## Rule used

An FTD is "late (retention)" when all of these hold:
- it is qualified (`qualified_at` set) and counts as a conversion FTD (not legacy);
- the client's potential is low or unset, so it qualified on balance rather than on potential;
- `qualified_at` falls in a later calendar month than the activation date.

## Technical notes

- Add `isLateRetentionFtd(row)` to `src/lib/rules.ts` (plus a `monthsLate(row)` helper) so every page uses one definition, with unit tests in `src/lib/__tests__/rules.test.ts`.
- Add a small `LateFtdBadge` component (next to the existing badges in `src/components/status-badge.tsx`) rendering the badge + tooltip.
- Update consumers: `src/routes/_authenticated/activations.tsx`, `employees.$id.tsx`, `performance.tsx`, `reports.tsx`, `src/components/conversions-by-agent.tsx`, `src/components/activated-leads-by-employee.tsx`.
- Export columns come from the existing `src/lib/export.ts` column definitions on each page.
- No migration needed: `potential`, `activation_date` and `qualified_at` already exist on `daily_lead_activations`.
