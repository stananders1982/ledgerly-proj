# Affiliate balances: guaranteed weekly minimum

Change how each affiliate week is settled so the guarantee is a **minimum payment**, and add
activation % and reported % everywhere the weekly table appears.

## New settlement rule (per affiliate, per Mon–Sun week)

```text
Valid leads     = received - invalid
Guaranteed      = Valid leads x guarantee %
Payable         = max(Reported, Guaranteed)      <-- changed (was min)
Cost            = Payable x CPA price
Activation %    = Activated / Valid leads
Reported %      = Reported / Valid leads
Shortfall       = max(0, Guaranteed - Reported)  (paid but not delivered)
Extra           = max(0, Reported - Guaranteed)  (delivered above guarantee, paid at CPA)
```

Example: 100 valid leads, 15% guarantee, $1,500 CPA.
- 10 reported (10%) -> pay 15 x 1,500 = **$22,500**, shortfall 5.
- 20 reported (20%) -> pay 20 x 1,500 = **$30,000**.

Affiliates with no guarantee % stay flat: pay CPA x reported.
Each week settles on its own; balance owed = sum of weekly cost − payments recorded as
expenses tagged to that affiliate.

## What changes on screen

**Affiliate statement page (`/affiliates/:id`) — weekly table**

| Week | Leads | Invalid | Valid | Activated | Act % | Reported | Rep % | Guaranteed | Payable | Cost | Shortfall | Status |

Status: Over (reported above guarantee), Met, or Short (guarantee paid, delivery missing).
Totals row recomputes Act % and Rep % from the summed valid leads. Included in the PDF export.

**Summary cards**: Owed (range), Paid, Balance, plus Activation % and Reported % for the range,
and delivery % against guarantee.

**Affiliates list (`/affiliates`)**: add Activation % and Reported % columns next to the existing
Price / Guarantee % / Owed / Paid / Balance columns, and show range-wide Act % / Rep % in the KPI
cards.

## Technical notes

- All math stays in `src/lib/affiliate-balance.ts`:
  - `LeadEntryLike` gains `invalid`; `WeekRow` gains `invalid`, `valid`, `activationPct`,
    `reportedPct`, `extra`; `guaranteed` is computed from valid leads.
  - `payable = max(reported, guaranteed)` for guaranteed affiliates; `savings` is dropped from the
    cost math (over-delivery is now paid, not free) and replaced by `extra` cost visibility.
  - `sumWeeks` aggregates the new fields and recomputes percentages from totals; `mergeWeekRows`
    (billing groups) merges them the same way.
- Update `src/lib/__tests__/affiliate-balance.test.ts` to cover under-delivery (pays the guarantee),
  over-delivery, invalid-lead exclusion, and flat (0%) affiliates.
- Consumers to update for the new fields: `src/routes/_authenticated/affiliates.index.tsx`,
  `src/routes/_authenticated/affiliates.$id.tsx` (table, cards, CSV/PDF export), and any reports
  reading `savings` from these helpers.
- Lead-entry queries for affiliates must select `invalid` alongside `received`, `reported`,
  `activated`.
- No database changes.
