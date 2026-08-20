# Affiliate balance alerts

Get warned when an affiliate's running balance drifts near zero — either the credit you paid ahead is nearly used up, or the amount you owe is about to build up.

## How it works

Each affiliate gets its own **Alert threshold** (a money amount, e.g. 2,000). The affiliate's current closing balance from the weekly ledger is compared against it:

- Balance inside the window `-threshold … +threshold` → "near zero" alert.
- Only affiliates with balance tracking activated are checked (no threshold, no alert).
- Default threshold when left blank: none (alerts off for that affiliate).

The wording adapts: "credit nearly used up" when the balance is negative (you're ahead), "balance is about to turn into debt / owing" when it's at or above zero.

## Where you'll see it

1. **Affiliate statement page** — a banner at the top of `/affiliates/<id>` when that affiliate is inside the window, showing current balance, threshold, and last week's cost so you know how long the credit lasts.
2. **Dashboard alerts strip** — the existing smart-alerts strip gains affiliate balance items, dismissible like the rest.
3. **Notification bell** — one notification per affiliate per day when it crosses into the window, so you get it even without opening the affiliates page.

## Setting the threshold

The threshold lives in the existing Affiliate Balance activation dialog on the affiliate page, next to the start date and starting balance: a new "Alert me when balance is within" field. Editable at any time.

## Technical notes

- Migration: add `alert_threshold numeric` (nullable) to `affiliates`; no new table. Existing GRANTs and RLS already cover the column.
- New helper in `src/lib/affiliate-balance.ts`: `balanceAlert(affiliate, closingBalance)` returning `{ level, message }` or null — unit-tested alongside the existing balance tests.
- Balance is computed the same way the statement page already does it: `weeklyLedger(...)` closing balance of the latest week, seeded by the opening balance.
- Dashboard: extend `detectAnomalies` inputs in `src/lib/anomalies.ts` with affiliate balances, and fetch affiliates + their lead entries/payments in `src/components/anomaly-alerts.tsx`, linking to the affiliate page.
- Notification bell: a client-side once-a-day check mirroring `src/components/task-reminders.tsx`, inserting into `notifications` with `type: 'affiliate_balance'` and a localStorage day stamp so it fires once per day.
- Affiliate page banner and the threshold input go in `src/routes/_authenticated/affiliates.$id.tsx`; the affiliates list gets a small warning dot next to affiliates currently in the window.
