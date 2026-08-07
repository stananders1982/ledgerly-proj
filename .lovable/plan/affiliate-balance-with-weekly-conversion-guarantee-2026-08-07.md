# Affiliate balance with weekly conversion guarantee

Give every affiliate a running balance built from their own activation price and guaranteed conversion rate, settled week by week (Mon–Sun), with reported activations as the counted conversions.

## Settlement rules (per affiliate, per week)

For each Mon–Sun week, using that affiliate's lead entries:

```text
Leads received      = sum of received in the week
Guaranteed convs    = Leads received x guarantee %      (rounded to 2 decimals)
Reported convs      = sum of reported in the week
Payable convs       = min(Reported, Guaranteed)
Cost                = Payable convs x activation price
Savings             = max(0, Reported - Guaranteed) x price   (extra conversions are free)
Shortfall           = max(0, Guaranteed - Reported)           (conversions not delivered)
```

Each week settles on its own — no rollover into the next week.

Affiliate balance = sum of weekly Cost across the selected range − payments already recorded
as expenses tagged to that affiliate. Positive balance = still owed to the affiliate.

## What gets built

**1. Affiliate terms editing**
On the Affiliates page, an "Edit terms" dialog per affiliate: activation price (CPA), guaranteed
conversion rate %, guarantee period (weekly default), active toggle. These become the source of
truth for the calculation; existing values are seeded from the matching lead source.

**2. Affiliates list — new columns**
Price, Guarantee %, Owed (cost for the selected range), Paid, Balance. A date range picker on the
page drives all of them, with totals in the KPI cards (Owed, Paid, Balance, Savings).

**3. Affiliate statement page — weekly guarantee table**
New section above the monthly breakdown:

| Week (Mon–Sun) | Leads | Guaranteed | Reported | Payable | Cost | Savings | Shortfall | Status |

Status is Met / Short / Over. Row totals at the bottom, and the section is included in the
existing Statement PDF export.

**4. Balance summary on the statement**
Cards for Owed (range), Paid to affiliate, Balance outstanding, plus Guarantee delivery %
(reported ÷ guaranteed).

**5. Payments stay as expenses**
No new payment table — payments are the existing expenses tagged with an affiliate, exactly as
today. The statement links each payment through to the expense.

## Technical notes

- Lead entries are joined to affiliates through `daily_lead_entries.source_id -> lead_sources.name -> affiliates.name` (names already match one-to-one for all six affiliates).
- Weekly aggregation is computed client-side in a shared helper `src/lib/affiliate-balance.ts` so the Affiliates list, statement page and reports all use identical math.
- A migration adds nothing structural except making `affiliates.guarantee_period` default to `weekly` and backfilling `cpa_rate` / `guarantee_value` from the matching `lead_sources` row where they are still 0; the existing `affiliate_guarantee_periods` table and `recompute_affiliate_period` function are left untouched (they model a different, event-based flow and are not used by these screens).
- Editing affiliate terms is admin-only, following the existing action-permission checks.
