## The problem

Activations have no date of their own. Each activation row hangs off a lead entry and inherits that entry's date, so an April lead activated today is counted as an April activation everywhere — including the conversion agent's FTD count and $100 commission.

## The fix

Add an **Activation date** to every activation, defaulting to today, and split reporting into two clocks:

- **Lead clock (entry date)** — Leads received, CPL costs, CPA costs payable, CPA savings, source conversion/target stats. Unchanged.
- **Activation clock (activation date)** — Activated / FTD / STD / Allocated counts, conversion agent FTDs and commissions, Clients page, Employee Performance, employee detail pages.

So an April lead activated in July: April keeps the lead and the affiliate billing; July gets the FTD and the agent's commission.

## What changes for you

1. **Leads page** — each activation row in the lead dialog gets an "Activated on" date field, prefilled with today. The Activated / FTD / STD / Allocated cards count activations dated inside the selected period, even when the lead itself is older. The lead table columns (Received, Reported, Costs, Savings, Conversion %) keep working off the lead's date.
2. **Clients page** — a new sortable "Activated" column and the date filter both use activation date; the client detail dialog shows both the lead date and the activation date.
3. **Employee Performance and employee detail pages** — FTDs, pending FTDs, conversions and FTD commission are filtered by activation date.
4. **Backfill** — every existing activation gets its activation date set to the date the row was created. Some past-month figures will shift to match when the work actually happened.

## Technical details

- Migration: add `activation_date date not null default current_date` to `daily_lead_activations`; backfill `activation_date = created_at::date`; index on `(company_id, activation_date)`.
- `src/routes/_authenticated/leads.tsx`: add `activation_date` to the `Split` type, the dialog row UI, and both the insert and update paths of `upsert`; new rows default to today rather than the entry date. Recompute `byEmployee`, `allocated` and `stdCount` from activations filtered by `activation_date` within `activeRange` instead of by visible entry ids. `stats` (received/reported/CPL/CPA/savings) stays entry-based; the Activated KPI card switches to the activation-dated count while the per-row "Activated" column stays as-is.
- `src/routes/_authenticated/activations.tsx`: query and filter on `activation_date`, add it to the sort map and the table/cards, keep the entry date visible as "Lead date".
- `src/routes/_authenticated/performance.tsx` and `employees.$id.tsx`: replace the `daily_lead_entries!inner(entry_date)` range filters with `gte/lte` on `activation_date` (dropping the inner join where it was only used for dating).
- Existing FTD qualification rules in `src/lib/rules.ts` are unchanged — only the set of rows fed into them moves.
