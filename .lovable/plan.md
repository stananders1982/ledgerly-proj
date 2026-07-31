## Goal

Make STD (Second Time Deposit) mean one thing everywhere: the client's $250 activation balance is the FTD, so **any recorded deposit after the activation date is an STD**, and it belongs to the period in which that deposit was made.

## The rule (single source of truth)

Add STD helpers to `src/lib/rules.ts` so no page re-implements it:

- Match a deposit to a client by `activation_id` first, falling back to name match (same precedence the Clients page already uses).
- A deposit qualifies as an STD event when its date is on or after the client's activation date (activation date falls back to the lead entry date when missing).
- `stdDepositsFor(client, revenueRows)` returns the qualifying deposits; `isStd(client, revenueRows)` is true when there is at least one.
- No FTD qualification requirement — any activated client is eligible.
- Period scoping is done by the **deposit date**, not the activation date.

## Leads page (`/leads`)

- Replace the current STD calculation with the shared helper.
- Count distinct clients who have at least one qualifying deposit **dated inside the selected range** (the activation itself can be from any earlier period — an April client depositing again in July counts in July).
- Change the card from `STD 1 / 2` to a single number, since the denominator (activations in range) no longer describes the same population. Add the hint "Clients who deposited again in this period".

## Clients page (`/activations`)

- New **STD** column: a badge showing Yes/No, plus the number of qualifying deposits when there is more than one (e.g. "STD ×2"), so it's visible per client.
- Make the column sortable, consistent with the other headers.
- New filter next to the existing Answered / Potential filters: All / STD only / No STD.
- STD status here reflects deposits made on or after activation, regardless of the page's date range (the range still filters which clients are listed, by activation date, as it does today).
- The existing client detail dialog already lists deposits with dates; mark the deposits that count as STD there for clarity.

## Not changing

- FTD rules, commissions, and pending logic stay exactly as they are.
- No database changes — this is derived from existing `daily_lead_activations` and `revenue` rows.

## Technical notes

- `src/lib/rules.ts`: add `stdDepositsFor`, `isStd`, and an activation-date helper reused by both pages.
- `src/routes/_authenticated/leads.tsx`: swap the local `stdCount` memo for the shared helper, filtered by deposit date in range.
- `src/routes/_authenticated/activations.tsx`: add the column, sort key, filter state, and dialog highlighting.
- Verify with `tsgo` after the edits.
