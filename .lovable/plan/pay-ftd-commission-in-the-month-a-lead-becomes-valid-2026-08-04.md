# Pay FTD commission in the month a lead becomes valid

Today a conversion agent's FTD commission is counted in the month of the **activation date**. A lead that was pending in July and only becomes valid in September is never paid, because by September its activation date is out of range.

Change: each activation gets a "qualified on" date — the day it first met the FTD rule (answered + mid/high potential, or balance over the threshold). Commission is counted in the month of that date, not the activation month.

## Behaviour

- Lead activated and valid the same day: unchanged — counted in the activation month (qualified date = activation date).
- Lead pending in July, deposits or gets marked answered in September: counted as an FTD for the conversion agent in **September**, paid at that agent's per-FTD rate.
- Once a lead is qualified, the date is frozen — later edits or deposits never move it, so a paid FTD is never paid twice or shifted between months.
- Still pending = still unpaid, exactly as now.

## Where it shows

- Employee detail page: FTDs / FTD commission / net payout for the selected month use the qualified date. The activations table gains a "Qualified" column, and rows that were activated in an earlier month are marked (e.g. "activated 27 Jul").
- Employee Performance page: FTD counts and commission per agent switch to the qualified date. "Pending FTDs" continues to list unqualified leads by activation date.
- Clients page: shows the qualified date alongside the activation date so it's clear when a late qualification happened.

## Technical notes

- Add `qualified_at date` (nullable) to `daily_lead_activations`.
- Backfill in the same migration: for rows that already satisfy the rule, set `qualified_at = activation_date` (no change to past payouts); leave pending rows null.
- Maintain it with database triggers so it works no matter where the edit comes from:
  - on `daily_lead_activations` insert/update — if `qualified_at is null` and the row now qualifies (using balance plus deposits matched by client name / `activation_id`), set it to the greater of the activation date and today.
  - on `revenue` insert/update — re-evaluate the matching activation and stamp `qualified_at` with the deposit date when that deposit is what pushes it over the threshold.
- The qualification rule lives in one SQL function mirroring `qualifiesAsFtd` in `src/lib/rules.ts`, with the balance threshold read from company settings.
- Frontend: queries for conversion FTDs filter on `qualified_at` between the range start/end instead of `activation_date`; pending queries keep using `activation_date`. Affected files: `src/routes/_authenticated/employees.$id.tsx`, `src/routes/_authenticated/performance.tsx`, `src/routes/_authenticated/activations.tsx`.
