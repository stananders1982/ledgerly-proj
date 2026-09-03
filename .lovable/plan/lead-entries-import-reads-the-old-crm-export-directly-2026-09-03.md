# Lead entries import reads the old-CRM export directly

## Problem
The old-CRM export has per-lead columns (ID, Full Name, E-mail, Phone, Country, Created Date, Source, Funnel Name, Affiliate Data, Affiliate Name, Assigned to, Status, FTD Total, Lifetime Deposit, FTD Time, FTD Owner, Tag). The "Lead entries" importer only knows Date / Affiliate / Campaign / Received / Activated / Reported / Notes, so every column shows "Skip column" and the required Date and Received are never satisfied.

## What changes
Redefine the Lead entries importer around the old-CRM columns so the raw export maps automatically, and roll the per-lead rows up into the Daily numbers totals.

### New column set
Same labels as the old-CRM export, so auto-matching catches all of them:
ID, Full Name, Full Name 2, E-mail, E-mail2, Phone, Country, City, Age, Created Date (required), Source, Funnel Name, Affiliate Data, Affiliate Name, Assigned to, Status, FTD Total, Lifetime Deposit, FTD Time, FTD Owner, Tag.

Nothing has to be skipped; columns that don't affect the daily totals are simply read and ignored for counting.

### How rows become daily numbers
Rows are grouped by **date (from Created Date) + affiliate/source** (Affiliate Name, falling back to Source), then per group:

- **Received** = number of rows in the group
- **Invalid** = rows whose Status is one of the invalid statuses already used elsewhere in the app (need to cancel, wrong number, never registered, wrong person, no language, under age, wrong details)
- **Activated** = rows with FTD Total greater than 0, or status FTD / Deposited
- **Reported** = left at 0 (not present in the export)
- **Campaign** = Funnel Name when every row in the group shares one, otherwise blank
- **Notes** = "Imported from old CRM export"

Existing Daily numbers rows for the same date + affiliate are updated by adding the new counts rather than inserting a duplicate row, so several uploads during a shift keep the totals correct.

### Template and preview
- "Download template" produces the old-CRM header row.
- The preview table in the dialog shows the grouped result — one line per date + affiliate with the Received / Invalid / Activated it will write, and whether that day's row is new or updated.
- The description on the card is updated to say it takes the raw old-CRM export.

## Technical notes
- All changes live in the `lead-entries` definition in `src/routes/_authenticated/import.tsx`: new `fields`, new `sampleRows`, a grouping step in `onImport`, and an `onPreview` that returns the same grouping as `PreviewResult` rows.
- Status classification reuses the invalid-status list and `OLD_CRM_LEAD_STATUS` map already in that file.
- Affiliate/source resolution reuses `sourceByName` / `affiliateByName` / `matchDirectory`.
- Writes go to `daily_lead_entries`; existing rows for a date + source are fetched first and updated with incremented counts.
- The separate "Leads (old CRM export)" importer, which creates the individual lead records, is unchanged.
