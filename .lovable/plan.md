# Auto-create clients for deposits with no client record

Today's deposits from **Robert Dix** and **Wayne Hughes** don't have a matching client (activation) record, so they can never count as FTD/STD and never show on the Clients page. This adds automatic client creation so every deposit belongs to a client.

## What changes for you

1. **Recording income asks for the missing client details.** In the Record Revenue dialog, if you don't pick a client from the list, a "New client" block appears and asks for:
   - Full name (prefilled from the customer name you typed)
   - Date of activation (defaults to the deposit date)
   - Conversion agent who activated the client (Team C)
   - Retention agent who holds the client (Team R)

   Saving creates the client record with the workspace default balance and links the deposit to it, so it appears on the Clients page right away.
2. **These fields are required** when no client is selected, so no new deposit can create an unattributed client.
3. **Past deposits are left as they are.** No backfill runs — existing orphan deposits (Robert Dix, Wayne Hughes) stay untouched; you can create those clients manually if you want them tracked.
4. **STD counts become correct going forward.** With a client record and a linked first deposit, later deposits are properly recognised as STDs instead of being invisible.

## Behaviour rules

- Matching is by trimmed, case-insensitive customer name (same rule the app already uses elsewhere). If the typed name already matches an existing client, it links to it instead of asking for new details.
- The client's activation date is what you enter (deposit date by default); the first deposit is the FTD, so a later deposit is the STD.
- Conversion agent choices are Team C employees, retention agent choices are Team R — same filtering already used on the Clients page.

## Technical notes

- `daily_lead_activations.entry_id` and `employee_id` are currently `NOT NULL`, which blocks client records created outside a daily lead entry. Migration makes `entry_id` nullable only (schema change, no data migration).
- Retention agent maps to the existing `employee_id` field, conversion agent to `conversion_employee_id`.
- Call sites that read activations (leads, activations, performance, reports, employee detail, dashboard) get null-safe handling for a missing `entry_id`.
- Revenue dialog work is in `src/routes/_authenticated/revenue.tsx`: when `activation_id` is empty, render the new-client fields, validate them, insert the activation, then save the revenue row with the new `activation_id`.

