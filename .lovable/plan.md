# Affiliate payments inside the affiliate page + a clean "charge from" date

Goal: nothing before the date you choose is ever counted — no old weeks, no old top-ups — and you can record a payment to the affiliate right on their page.

## 1. "Charge from" date replaces the opening balance

Today the balance dialog asks for a start date **and** an opening balance, and that opening balance is what produced the confusing $3,920 on Amaze (16,000 old debt + 7,920 cost − 20,000 paid).

Change it to a single, simple control:

- The dialog becomes **Start charging from** with one date field (plus the on/off switch).
- Opening balance is removed from the form and stored as 0 for everyone going forward.
- Existing affiliates that already carry an opening balance (Amaze has 16,000) get it cleared, so the balance is derived purely from what happens on or after the start date.

## 2. Everything is filtered by that date

- Weekly settlement rows: only weeks whose lead entries fall on or after the start date (already the behaviour, kept).
- Payments to the affiliate: only payments dated on or after the start date count toward "Paid to affiliate" and the balance. Earlier top-ups stay in the books/expenses but never touch this affiliate's balance.
- Balance card formula becomes: reported cost since start − payments since start. The "includes X opening balance" note disappears.

## 3. Record a payment on the affiliate page

Next to the "Start charging from" button, add an **Add payment** button (admins only) opening a small dialog:

- Amount
- Date (defaults to today)
- Note (optional, e.g. "wire 19/08")

Saving records it as an affiliate payout (the same affiliate expense records used today, shared across a billing group), then refreshes the cards, the transaction list and the balance immediately. If the date is before the start date, the dialog warns that it won't be counted.

## 4. Running balance that rolls forward

The balance never resets at the end of a week or month — it carries over.

- The weekly settlement table gets two extra columns: **Paid** (payments made in that week) and **Running balance** (previous week's balance + this week's cost − payments in that week).
- If you overpay/top up, the running balance goes negative (credit) and that credit is carried into the next week and next month automatically, so the following weeks' costs are eaten by it before you owe anything again.
- The top balance card shows the true running balance as of today (from the start date, regardless of the date filter), with a small line like "Credit carried over: $4,200" or "Owed: $1,300", so switching the date filter to "This week" no longer hides last week's leftover.
- A short **Balance ledger** summary under the weekly table shows: opening (0 or previous carry) → cost → paid → closing, per week and per month.

## Technical notes

- `src/routes/_authenticated/affiliates.$id.tsx`: rewrite the activation dialog (drop `opening` field), add a payment dialog that inserts into `expenses` with `affiliate_id`, `date`, `amount`, `notes`, `company_id`; invalidate `affiliate-expenses` on success.
- `src/lib/affiliate-balance.ts`: `openingBalance()` becomes 0 / is removed from the balance math; keep `balanceActive` and the start-date gate.
- Data change: `UPDATE affiliates SET opening_balance = 0` so no legacy debt leaks in. No schema change needed (`balance_start_date` / `balance_activated_at` already exist).
