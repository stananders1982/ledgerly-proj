# Affiliate balance: pay the weekly conversion guarantee

The affiliate pages already show a weekly Mon–Sun settlement with Owed / Paid / Balance. The
math is wrong for missed weeks: today a week that under-delivers is billed at the delivered
conversions only. You want the guarantee honoured instead.

## New weekly rule (per affiliate)

```text
Leads received   = sum of received in the week
Guaranteed convs = leads x guarantee %          (from the affiliate's terms)
Reported convs   = sum of reported in the week
Payable convs    = max(reported, guaranteed)    -- floor, not a cap
Cost             = payable x FTD price
Shortfall        = max(0, guaranteed - reported)   -> paid but not delivered
```

So for 100 leads, 10% guarantee, $200 price:
- 8 reported -> pay the guaranteed 10 = $2,000, shortfall 2 conversions flagged
- 13 reported -> pay all 13 = $2,600 (over-delivery is paid in full)

The guarantee is a floor only: exceed it and every reported FTD is paid. There is no
"savings" from over-delivery any more, so that column is dropped.

Affiliates with no guarantee % keep the current flat behaviour: pay every reported
conversion at the FTD price.

Balance stays: `sum(weekly cost) − payments recorded as expenses tagged to that affiliate`.
Positive = still owed.

## What changes on screen

**Affiliate detail page**
- Weekly guarantee table: `Payable` is the greater of reported and guaranteed, `Savings` is
  replaced by a `Shortfall cost` column (what we paid for conversions never delivered), and
  the row status reads Met / Short / Over.
- Balance cards (Owed for range, Paid, Balance outstanding, Delivery %) recompute from the
  new cost, plus a period "Shortfall cost" figure — the number to negotiate on.

**Affiliates list**
- Owed / Paid / Balance columns and the KPI cards pick up the new math automatically; the
  Savings column becomes Shortfall cost.

**Statement export**
- The PDF/CSV statement includes the same columns, so the numbers sent to the affiliate
  match the screen.


## Technical notes

- Single change point: `weeklyGuarantee()` in `src/lib/affiliate-balance.ts` sets
  `payable = guaranteed` when `guarantee_value > 0`, keeps the flat path when it is 0, and
  adds `shortfallCost = shortfall x price` to `WeekRow`; `sumWeeks` and `mergeWeekRows`
  aggregate the new field. Every screen already reads from this helper, so the list, detail
  page, group billing and exports stay consistent.
- `src/lib/__tests__/affiliate-balance.test.ts` gets cases for under-delivery, exact
  delivery, over-delivery and the flat (no guarantee) affiliate.
- No database or schema changes: price and guarantee % already live on the affiliate record
  and are editable through the existing "Edit terms" dialog; payments remain expenses tagged
  to the affiliate.
