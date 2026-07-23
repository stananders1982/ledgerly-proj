## Goal
Track how many activated leads each employee received per day, by splitting a daily entry's activated count across multiple employees.

## Database
New table `public.daily_lead_activations`:
- `entry_id` → `daily_lead_entries(id)` on delete cascade
- `employee_id` → `employees(id)`
- `activated_count` int (>= 0)
- unique (entry_id, employee_id)
- RLS: authenticated read/write (consistent with existing leads tables)
- GRANTs to authenticated + service_role

## Leads page (`/leads`)
In the entry dialog, when `activated > 0` show an "Attribution" section:
- List of rows: employee dropdown (from `list_employees_directory`) + count input
- "Add employee" button
- Live validation: sum of counts must equal `activated` (show remainder / over-allocation warning); save disabled if mismatched
- On save: upsert entry, then replace child rows in `daily_lead_activations`
- On edit: load existing splits

Table row: small "Attribution" summary (e.g. "Jack 5 · Sara 3") under the Activated cell, or expand-on-click.

## New KPI / view
Add a new stat card "By employee" on the Leads page that opens a breakdown, OR add a compact table below KPIs:
- Columns: Employee · Activated leads (in selected date range + affiliate filter)
- Sorted desc

## Reports
Add "Activations by Employee" tab in Report Center using the same aggregation, exportable to CSV/XLSX.

## Technical notes
- New fetcher joins `daily_lead_activations` → `daily_lead_entries` filtered by date range and selected source IDs.
- No changes to CPA/CPL cost math; attribution is display-only.
- Backfill: existing entries have no splits — they'll simply show as unattributed until edited.
