# Starting balance when you activate an affiliate

Right now activating an affiliate only asks for a "Start charging from" date, and the balance always
starts at zero. You want to be able to open with a real figure — e.g. Amaze already sits at -$4,000
(you're in credit with them) before any new week is counted.

## What changes

The **Start charging from** dialog gets a second field: **Starting balance**.

- Empty / 0 means the same as today: start clean from the date.
- A positive number means you owe the affiliate that much on the start date.
- A negative number (e.g. `-4000`) means credit — you're ahead, and it gets eaten by the coming
  weeks' costs before you owe anything again.
- Helper text under the field spells this out, plus a live preview line like
  "Starts at $4,000 credit on 2026-08-17".

It's editable later from the same dialog (admins only, same permission as today).

## How it flows through the numbers

- The weekly ledger starts its running balance at the starting balance instead of 0. The first week
  row shows it as its opening figure, so the table ties out.
- The balance card shows the running total including it, with a note "includes $4,000 opening credit"
  so it's never a mystery number again.
- Nothing dated before the start date is pulled in — old weeks and old top-ups stay excluded exactly
  as they are now. The starting balance is the only thing carried over.

Your Amaze example: activate from the chosen date with starting balance `-4000`, then record the
$20,000 payment via **Add payment** on the same page; the ledger rolls both forward correctly.

## Technical notes

- Reuses the existing `affiliates.opening_balance` column (kept, currently forced to 0). No migration
  needed.
- `src/lib/affiliate-balance.ts`: `weeklyLedger(weeks, paidByWeek, opening = 0)` seeds `running` with
  the opening value; restore a small `openingBalance()` accessor that reads the column.
- `src/routes/_authenticated/affiliates.$id.tsx`: add the amount field to the activation dialog form,
  persist it on save (instead of the hard-coded `opening_balance: 0`), pass it into `weeklyLedger`,
  and surface it in the balance card subtitle.
- Group billing: as with the start date, the same starting balance is written once for the group's
  own record so it isn't double counted across members.
