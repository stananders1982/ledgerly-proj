# Shift Bar — fast leads & FTD updates on the Leads page

A sticky "Today" strip pinned at the top of the Leads page so mid-shift updates take
seconds instead of opening the full entry dialog each time.

## What it looks like

```text
┌ Today · Mon 17 Aug ────────────────────────── Received 42 · FTDs 6 · Reported 4 ┐
│ Affiliate A   Received [ 18 ] +1 +5   Activated [ 3 ]   Reported [ 2 ]          │
│ Affiliate B   Received [ 24 ] +1 +5   Activated [ 3 ]   Reported [ 2 ]          │
│ + add affiliate row                              [ Add FTD ]  [ Unallocated 2 ] │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Behaviour

**1. Bump counts per affiliate**
- One row per affiliate that already has an entry today, plus a picker to start a new
  affiliate row for today (creates the day's entry on first save).
- Received / Activated / Reported are editable number fields with `+1` and `+5` quick
  buttons. Each change saves on its own with a short debounce — no Save button, no dialog.
- Numbers can also be typed directly and confirmed with Enter or blur.
- Editing "Activated" only changes the day's headline count; naming the FTD is the
  separate flow below, so counts never get blocked on missing details.

**2. Add a new FTD fast**
- "Add FTD" opens a compact inline form: Client name, Affiliate, Conversion agent,
  Retention agent, Potential. Date defaults to today, balance to the company default.
- Saving creates the named activation, links it to today's entry for that affiliate,
  bumps that entry's activated count, keeps the form open, clears it and refocuses the
  name field so several FTDs can be logged in a row.
- Enter submits; Esc closes.

**3. Fix / allocate existing FTDs**
- The bar shows an "Unallocated N" chip when today has FTDs with no retention agent.
- Clicking it expands a compact list of today's FTDs — name, conversion agent,
  retention agent, potential — each editable inline via dropdowns that save instantly.
- The existing app-wide unallocated-FTD alert keeps covering older days.

**4. Live totals**
- The strip header shows today's Received / FTDs / Reported, updating as you type, so
  you can sanity-check the shift without scrolling.

## Details

- Everything writes to the existing `daily_lead_entries` and `daily_lead_activations`
  tables through the same payload shape the current entry dialog uses. No schema change,
  no migration.
- Optimistic updates with rollback on error, plus the same query invalidations the entry
  dialog already fires, so KPI cards, the table and the dashboard stay in sync.
- The strip is collapsible and remembers its state per user; it is hidden for users who
  lack the leads create/edit action permission.
- Only Leads-page files change: a new `src/components/shift-bar.tsx`, mounted in
  `src/routes/_authenticated/leads.tsx` above the KPI cards. The existing "Add entry"
  dialog and CSV import stay exactly as they are for full/back-dated edits.
