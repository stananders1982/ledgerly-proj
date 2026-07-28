## Goal
Make `/employees/$id` show only what's relevant to the employee's department (`team` = C, R, or M), instead of one identical layout for everyone.

## Team C — Conversion
Focus: activations and FTDs.
- Stat cards: FTDs (activations), FTD commission ($100/FTD), Pending FTDs, Working days, Absences, Salary after absences, Net payout.
- Tables: FTDs table (counted + pending, with reason) and the Activated leads table.
- Hidden: Attributed revenue, tiered commission, revenue/client, withdrawals, revenue and withdrawals tables.
- Payout breakdown: base salary − absence deduction + FTD commission.

## Team R — Retention
Focus: the clients they hold and money they generate.
- Stat cards: Clients received (retention), Revenue / client, Attributed revenue, Commission (tiered %), Withdrawals, Withdrawal penalty (10%), Working days, Absences, Salary after absences, Net payout.
- Tables: Revenue table, Withdrawals table, and the Activated leads (clients received) table.
- Hidden: FTDs cards and FTD table (conversion-only).
- Payout breakdown: base salary − absence deduction + tiered commission − withdrawal penalty.

## Team M — Marketing
Focus: attendance and pay only.
- Stat cards: Working days, Absences, Salary after absences, Net payout.
- Hidden: FTDs, activated leads, attributed revenue, commission, revenue/client, withdrawals sections.
- Payout breakdown: base salary − absence deduction.

## Shared
- Header gets a small team badge (Conversion / Retention / Marketing) so it's obvious which view is in play.
- Employees with no team set fall back to the Retention layout (current default is `C`, so this is rare).
- Attendance/working-days block and the month picker stay on all three views.

## Technical notes
- All changes are in `src/routes/_authenticated/employees.$id.tsx`; no schema or query-logic changes to the FTD rules.
- Read `emp.team` into a `view` variable and gate each `<section>` / card / table with it.
- Skip firing the queries a view doesn't use (e.g. conversions query only when team C) via the `enabled` option, so the page stays fast.
- `totals.payout` becomes team-aware: FTD commission only for C, tiered commission and penalty only for R.
