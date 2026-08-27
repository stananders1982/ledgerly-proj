# Change STD rule: 2nd deposit anytime, not just same month

## Goal
Redefine STD (Second Time Deposit): a client's **second recorded deposit on/after their activation date** counts as the STD **no matter when it happens** — even a year later. Today it only counts if it lands in the same calendar month as the activation.

## Current state (confirmed)
- The single source of truth is `stdDepositsFor()` in `src/lib/rules.ts`. It picks the 2nd deposit on/after activation, then rejects it unless `second.date.slice(0,7) === act.slice(0,7)` (same calendar month).
- Every surface already goes through this one function: Leads page STD card + dialog, Clients list, Client profile page, Reports, Employee Performance, and the AI "Ask Your Data" snapshot. So one change updates the whole app consistently.
- The optional date-window argument (start/end) stays — the page's date filter still decides which STDs are shown in a period.

## Changes

1. **`src/lib/rules.ts`** — remove the same-calendar-month gate in `stdDepositsFor()`; update the doc comment to say: the second deposit on/after the activation date is the STD, regardless of how much later it occurs. An optional window can still restrict which STD dates are counted for a filtered view.

2. **`src/lib/__tests__/std.test.ts`** — update tests: a second deposit in a later month/year now counts; keep tests proving the first deposit is the FTD, window filtering still works, and deposits before activation don't count.

3. **Copy cleanup** — update any UI text that says "same month" for STD:
   - `src/lib/ask.functions.ts` comments describing the STD rule.
   - Leads page STD card / dialog description and Reports/Performance tooltips if they mention "within the same month".

## Resulting behavior
- Activation in April, 2nd deposit in August → STD counts (previously ignored).
- The date-range filter still applies when viewing a period: the STD shows in the period the 2nd deposit happened in.
- FTD logic, "Late (retention)" tracking, and balances are untouched.

## Technical notes
- No database or migration changes — this is a pure logic change in `stdDepositsFor()`.
- Verification: run the updated std test suite, then check the Leads page STD card/dialog and the Performance STD% against a client whose 2nd deposit is in a later month.
