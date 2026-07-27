## Goal
On the employee detail page (`/employees/$id`), give conversion agents a clear, auto-updating **FTDs (activations)** metric with the correct qualification rules.

## Counting rules (a lead counts as an FTD for the conversion agent when)
1. The activation's **conversion agent** is this employee, and
2. The lead is marked **answered**, and
3. **Potential is mid or high** — OR potential is low but the lead's **balance is $251 or more**.

Balance = the activation's base balance (default $250) plus any recorded deposits matched by customer name (same rule already used on the Activated Leads page). So a low-potential lead automatically qualifies the moment a deposit pushes it past $250, and any lead qualifies the moment it's marked answered — no manual recalculation.

## Page changes
- Rename the card "Leads activated (conversion)" to **"FTDs (activations)"**, showing the qualified count for the selected month.
- Keep a second card **"Pending"** for activations that don't yet qualify, with a short hint of why (unanswered vs. low potential under $251).
- Add an **FTDs table** listing qualifying activations: date, lead name, potential, balance (base + deposits), answered.
- Optionally list the pending ones underneath in a muted section so agents can see what's close to qualifying.

## Technical notes
- Extend the existing conversion query in `src/routes/_authenticated/employees.$id.tsx` to also select `balance` and the entry date.
- Add a revenue-by-customer-name lookup (same aggregation as `/activations`) to compute effective balance.
- Qualification helper: `answered && (potential === 'mid' || potential === 'high' || effectiveBalance >= 251)`.
- No schema or business-logic changes in the database; this is display/aggregation only.

## Open follow-up (not in this plan unless you want it)
The same FTD rule could be mirrored on the Activated Leads page's "Conversions by agent" table so the two screens always agree.
