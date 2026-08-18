# Legacy clients (old CRM) excluded from conversion FTDs

## Problem

Clients carried over from the previous CRM are stored the same way as new leads. When one of them deposits and we add them with a conversion agent, they get counted as an FTD (and commission) for that agent — but the agent was already paid in the old CRM. Only clients that actually came in as leads from affiliates should count as conversion FTDs.

## Solution

Add a "Legacy client (old CRM)" flag on clients. Legacy clients stay full clients — deposits, withdrawals, STDs, balances and reports all keep working — they are simply not credited as FTDs to a conversion agent.

### What changes

1. **New flag on clients**: `legacy` (yes/no), default no.
2. **Toggle in the UI**: a "Legacy client (from old CRM)" switch in the Add/Edit client dialog on the Clients page and in the client detail sheet, plus a small "Legacy" badge in the clients table and a filter to show/hide them.
3. **Backfill**: mark all 50 existing clients that are not linked to a daily lead entry as legacy.
4. **Counting rules** — legacy clients are excluded from:
   - Activated (FTD) and Pending cards on Leads and Clients
   - Conversions-by-agent leaderboard
   - Employee page FTD / pending / qualified counts and the FTD commission
   - "Clients received" for retention agents
   - Performance page, Reports (employees, funnel, source analytics), goals and dashboard scoreboards that score FTDs
   - AI "Ask your data" FTD/activation snapshots
5. **Still counted normally** for legacy clients: deposits, revenue, withdrawals, STDs, retention deposit/withdrawal totals, P&L and all money reports.

## Technical notes

- Migration: `ALTER TABLE public.daily_lead_activations ADD COLUMN legacy boolean NOT NULL DEFAULT false;` plus a data update setting `legacy = true WHERE entry_id IS NULL`.
- `src/lib/rules.ts`: add `countsAsConversionFtd(row)` = `!row.legacy && qualifiesAsFtd(...)` and a `isLegacyClient(row)` helper; route every FTD/pending count through it so the pages cannot drift apart.
- Update consumers: `conversions-by-agent.tsx`, `activated-leads-by-employee.tsx`, `employees.$id.tsx`, `performance.tsx`, `leads.tsx`, `activations.tsx`, `reports.tsx`, `source-quality.ts`, `dashboard` scoreboards, `insights/anomalies`, `ask.functions.ts`, and the public API report/activation endpoints.
- Keep the DB-side `activation_qualifies()` / `qualified_at` stamping unchanged (qualification is still tracked); only the conversion-credit layer filters on `legacy`.
- Exports (CSV/Excel) gain a `Legacy` column so the split is auditable.
