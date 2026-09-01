# Bring clients over from your old CRM

Today the Bulk Import page covers lead entries, income, expenses, employees, sources, affiliates and withdrawals — but there is no importer for **clients**, which is exactly what you are typing by hand. This adds one, and makes it work even when the old CRM has no export button.

## Three ways to get client data in

1. **Paste** — select rows in the old CRM (or any spreadsheet), copy, paste into a box. Tab- or comma-separated rows are detected automatically. This is the main path since the old CRM can't export a file.
2. **Upload a file** — CSV or Excel (.xlsx), if you ever manage to get one out.
3. **Messy paste (AI assist)** — paste unstructured text (a client card, an email, a screenshot's copied text) and the assistant turns it into rows you review before saving. Useful for one client at a time.

## What gets imported per client

Full profile in one row: name, phone, email, country, city, language, gender, date of birth / age, occupation, assigned agent, conversion agent, status (hot/warm/cold/dormant/churned), activation date, balance, potential value, tags, notes, next follow-up, preferred contact time, and the financial KYC fields (net worth, liquid funds, monthly income, exposure elsewhere, source of funds, deposit appetite).

Agent names are matched to existing employees automatically; unmatched names are flagged rather than silently dropped.

## Review before anything is saved

After paste/upload you get a mapping and preview step:

- Auto-matched columns, changeable from a dropdown (already how the CSV dialog works).
- A per-row status: **New**, **Will update** (matched an existing client), or **Error** with the reason (bad date, unknown agent, missing name).
- Counters at the top: how many new, how many updates, how many blocked.
- Nothing is written until you press Import; blocked rows are left out and listed so you can fix and re-paste.

## Duplicate handling — chosen per import

A selector in the dialog, as you asked:

- **Update existing** — match on phone, then email, then name; fill in fields that are present in the file, leave the rest alone.
- **Skip existing** — only new clients are created.
- **Create anyway** — import everything as new records.

## Technical notes

- New "Clients" import definition on `/import` writing to `daily_lead_activations` (company-scoped), reusing `CsvImportDialog` extended with: a paste textarea, XLSX parsing via the existing `parseSpreadsheet` in `src/lib/export.ts`, a duplicate-mode selector, and a validated preview table with row statuses.
- Duplicate matching runs client-side against existing activations for the company, and inserts/updates in batches of ~200 so large pastes don't time out.
- The AI-assisted "messy text" path uses a new server function on the existing Lovable AI setup, returning strict JSON rows into the same preview step — no direct writes from the model.
- Existing importers keep working unchanged; the paste tab and duplicate selector become available to all of them.
