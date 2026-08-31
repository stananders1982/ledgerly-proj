# Financial & client-management upgrade

Building all suggested improvements except client balance alerts (#5, skipped). Delivered in four phases so you can use each piece as it lands.

## Phase 1 — True money numbers

**Payment processing fees.** The fee percentages already in Settings (wire / card / crypto) start being applied. Every deposit shows gross, fee and net. Reports gain a "Processing fees" line, and P&L profit is based on net received.

**Profit per client.** Each client gets a real profitability figure: deposits minus withdrawals, minus their lead cost (from the source's CPL/CPA price), minus processing fees, minus the agent commission earned on them. Shown on the client profile and as a sortable column on the Clients list, so you can see who actually makes money.

**Cash runway card on the dashboard.** Current net cash position divided by average monthly burn = months of runway, with a trend line next to the existing forecast.

## Phase 2 — Control over the books

**Monthly close / reconciliation.** New page listing every deposit and withdrawal in a month with a tick box for "matches the bank". Progress bar shows how much is reconciled. Closing a month locks it — later edits to a closed month are blocked for non-admins and always flagged in the activity log.

**Withdrawal status & aging.** Withdrawals get a status (requested → processing → paid, or rejected) and a requested date. A dashboard card shows pending payouts and how long each has been waiting, with an overdue badge past a configurable number of days.

## Phase 3 — Client management automation

**Follow-up task engine.** A scheduled job creates tasks automatically: when a client's follow-up date arrives, and when a high-value client goes past the neglect window with no contact. Tasks are assigned to the client's retention agent and deduplicated so you never get the same task twice.

**Nightly client scoring.** Risk and opportunity scores refresh automatically each night for active clients instead of only when someone presses "Analyse". Scores are computed in small batches with strict limits, so cost stays predictable, and the manual button still works for an instant re-read.

**Weekly digest.** On login each Monday, each user sees a summary panel: their clients' deposits last week, upcoming follow-ups, neglected high-value clients and newly at-risk clients.

## Phase 4 — Data hygiene

**Duplicate detection & merge.** The Data Quality page lists likely duplicate clients (same name / phone / email). A merge tool shows the combined ledger side by side and merges deposits, withdrawals, comments, communications, tasks and attachments into one record.

**Bulk reassignment.** Select clients (or all of one agent's clients) and reassign the retention or conversion agent in one action, with an audit entry for each move.

**KYC checklist.** Per client: ID verified, proof of address, proof of funds, agreement signed — each with a date and who ticked it. A KYC status badge appears on the Clients list and can be filtered on.

## Technical notes

- Fees and profit-per-client are computed in a shared helper (`src/lib/profitability.ts`) reusing existing FX conversion (`toBase`/`toDisplay`), commission tiers and lead-source pricing, so every page shows the same figure.
- Migrations: `fee_amount`/`fee_pct` on `revenue`; `status`, `requested_at` on `withdrawals`; a `period_closes` table for monthly close; `kyc` jsonb plus `last_scored_at` on `daily_lead_activations`; a `job_runs` lease/status table for the scheduled jobs.
- Scheduled work (follow-up tasks, nightly scoring, weekly digest build) runs as bounded batch jobs behind `src/routes/api/public/v1/jobs/*` routes called by pg_cron, with a single-flight lock, per-run item caps, idempotent progress marking and a circuit breaker that pauses the job on AI credit/permission errors.
- Client merge runs in one server function that repoints `revenue`, `withdrawals`, `tasks`, `client_communications`, `record_comments` and `attachments` before deleting the losing record.
- Month locking is enforced in the database (trigger checking `period_closes`) as well as in the UI, so it can't be bypassed.
