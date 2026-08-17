# Two agent scoreboards on the dashboard

Add two new dashboard boxes, both driven by the dashboard's global date range.

## 1. Retention agents

Table with one row per active Team R agent:

| Agent | Deposits | Withdrawals | Total |
|---|---|---|---|

- Deposits: sum of revenue in the period attributed to the agent, split-adjusted (same rule already used on the Withdrawals page and employee pages: a split row gives each agent their percentage).
- Withdrawals: sum of withdrawals in the period, split-adjusted the same way.
- Total: Deposits − Withdrawals (net), shown green when positive, red when negative.
- Footer row with column totals; rows sorted by Total descending.
- Agent names are links to the employee detail page.

## 2. Conversion agents

Table with one row per active Team C agent:

| Agent | FTDs | Pending | Total |
|---|---|---|---|

- Same qualification rules already used by the "Conversions by agent" table on the Leads page (qualified FTD vs pending), scoped to the dashboard date range by activation date.
- Clicking a Pending number opens the existing-style dialog listing those pending clients (client, activation date, balance, potential, answered, reason); clicking a row jumps to that client on the Activations page.
- Footer row with totals, including an "all pending" dialog.
- Agent names are links to the employee detail page.

Managers (Team M) are excluded from both boxes.

## Visibility

Both boxes become toggleable dashboard sections so per-user/role dashboard permissions apply:
- "Retention scoreboard"
- "Conversion scoreboard"

Default on for admin roles, off by default for other roles (matching how existing optional sections behave).

## Technical notes

- New keys `dash:retention` and `dash:conversion` in `src/lib/dashboard-sections.ts` (labels, hints, role defaults).
- New components `src/components/retention-scoreboard.tsx` and `src/components/conversion-scoreboard.tsx`, both taking `{ start, end }`.
- Conversion box reuses the logic in `src/components/conversions-by-agent.tsx` (deposit index, `qualifiesAsFtd`, `ftdPendingReasons`, `effectiveBalanceIndexed`) — extract the shared computation so the Leads page and the dashboard stay in sync rather than duplicating rules.
- Employee lookup via the RLS-safe `list_employees_directory` RPC (so non-admins see names), team filtering through `AGENT_TEAMS` helpers in `src/lib/rules.ts`.
- Rendered in `src/routes/_authenticated/index.tsx` inside the existing two-column grid area, each wrapped in the `show(...)` guard.
