# Auto-create clients for deposits with no client record

Today's deposits from **Robert Dix** and **Wayne Hughes** don't have a matching client (activation) record, so they can never count as FTD/STD and never show on the Clients page. This adds automatic client creation so every deposit belongs to a client.

## What changes for you

1. **Recording income creates the client automatically.** When you record a deposit and the customer name doesn't match any existing client, a client record is created on the spot (activation date = deposit date, balance = the workspace default), and the deposit is linked to it. The client shows up on the Clients page immediately.
2. **Existing orphan deposits get cleaned up.** A one-time backfill creates a client for every past deposit whose customer name has no client record, using that customer's earliest deposit date as the activation date. Wayne Hughes (earliest deposit 14 Jul) and Robert Dix (3 Aug) both get records.
3. **Auto-created clients are marked.** They're tagged `auto` so you can spot them on the Clients page and fill in the missing details (potential, answered, conversion agent).
4. **STD counts become correct.** With a client record and a linked first deposit, later deposits are properly recognised as STDs instead of being invisible.

## Behaviour rules

- Matching is by trimmed, case-insensitive customer name (same rule the app already uses elsewhere).
- The client's activation date is the deposit date, and the first deposit is treated as the FTD, so a same-day second deposit is the STD.
- Nothing is auto-created when the deposit already picks a client from the lead picker.
- Auto-created clients start with no attribution (no conversion agent / no lead source), so employee commission and lead-count KPIs are not silently inflated.

## Technical notes

- `daily_lead_activations.entry_id` and `employee_id` are currently `NOT NULL`, which blocks standalone client records. Migration makes both nullable and adds a `source` column (`manual` / `auto`) defaulting to `manual`.
- Every page that reads activations joins/uses `entry_id` and `employee_id`; those call sites (leads, activations, performance, reports, employees detail, dashboard) get null-safe handling so unattributed clients don't break counts or crash.
- Auto-creation runs in the revenue insert path in `src/routes/_authenticated/revenue.tsx`: look up by normalised name, create when missing, then set `activation_id` on the revenue row.
- Backfill is a one-time SQL block in the same migration, inserting one activation per orphan customer name at their earliest deposit date, then setting `revenue.activation_id` for all of that customer's rows.
- Company scoping uses the existing `company_id` default, so backfill runs per company.
