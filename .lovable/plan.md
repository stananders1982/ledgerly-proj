# Affiliate balances start when you activate them

Right now every affiliate balance is calculated over whatever date range you pick, all the way back
to the first lead entry. Since the app only became the source of truth from July 1st, older weeks
produce numbers you never actually settled. This adds an explicit "Activate balance" step per
affiliate so money is only counted from the day you say so.

## How it works

Each affiliate gets three new settings, empty by default:

- **Balance active** — off until you activate it
- **Start date** — the first day that counts toward the balance
- **Opening balance** — what you already owe (or have prepaid, as a negative number) on that date

On the Affiliates page each row gets an **Activate balance** button. It opens a small dialog:
start date (defaults to today's week Monday) and opening balance (defaults to 0). Once activated,
the row shows money again; the button turns into "Balance settings" so you can adjust it later.

## What changes on screen

**Affiliates list**
- Not activated: Leads, Valid, FTDs, Act %, Guaranteed, Reported, Rep % all still show as today.
  Owed / Paid / Balance show "—" plus the Activate balance button.
- Activated: money columns count only weeks starting on or after the start date, and the balance
  begins from the opening balance:
  `balance = opening balance + owed (from start date) − payments (from start date)`
- The KPI cards at the top only total activated affiliates.

**Affiliate statement page**
- Weekly guarantee table lists only weeks on or after the start date.
- A first row "Opening balance (as of <start date>)" appears above the totals so the running
  balance ties out.
- If the affiliate is not activated the weekly section is replaced by a short prompt with the same
  Activate balance button; lead stats and history stay visible.
- Payments (affiliate-tagged expenses) dated before the start date are excluded, so you don't
  double-count anything already reflected in the opening balance.

The chosen date range picker still applies on top of this — the start date is a hard floor, never
a way to see earlier money.

## Technical notes

- Migration on `public.affiliates`: `balance_start_date date`, `opening_balance numeric not null
  default 0`, `balance_activated_at timestamptz`. No new table, existing grants and RLS unchanged.
  Nothing is backfilled — every affiliate starts inactive, so no retroactive numbers appear until
  you activate.
- Effective window becomes `max(rangeStart, balance_start_date)`; applied to the lead-entry filter
  and to the affiliate expense (payment) query in both `affiliates.index.tsx` and
  `affiliates.$id.tsx`.
- `src/lib/affiliate-balance.ts` gains a small helper for the floor date and the opening-balance
  term so the list, statement and exports agree; the weekly settlement math itself is unchanged.
- Activating / editing balance settings is admin-only, using the existing action-permission check
  already used by "Edit terms".
- Billing groups: members of one group must share a start date — the dialog activates the whole
  group at once and stores the same date on each member.
