# Suggested improvements — financial control & client management

A curated list of improvements for Ledgerly, ranked by impact. Tell me which ones to build (numbers are fine, e.g. "1, 2, 5") and I'll implement them.

## Financial

1. **Real profit per client.** Today a client shows deposits and withdrawals, but not their true cost. Combine their lead cost (source CPL/CPA), payment-method fees (wire/card/crypto %), and agent commissions so each client page and the Clients list show **net profit per client**. Instantly answers "which clients actually make us money."

2. **Payment method fee tracking.** Methods (card/wire/crypto) already have fee % in settings, but fees aren't deducted anywhere. Apply them automatically: every deposit records a computed fee, and Reports get a "Processing fees" line so P&L shows **net received**, not just gross.

3. **Monthly close / reconciliation workflow.** Revenue already has `reconciled_at`, but there's no UI flow. Add a "Close the month" page: list unreconciled deposits/withdrawals, tick them off against bank statements, lock the month, and flag any edits to closed periods in the activity log.

4. **Cash runway & burn rate on the dashboard.** You have fixed monthly costs and 90-day forecast — extend it into a "Runway" card: current net cash position ÷ average monthly burn = months of runway, with a trend line.

5. **Client balance alerts.** You already alert on affiliate balances. Add the mirror: alert when a funded client's balance drops below a threshold (e.g. under $500 or under 20% of total deposited) — that's the moment retention should call before the client goes quiet.

6. **Withdrawal aging / pending withdrawals.** Track withdrawal requests vs completed payouts (status: requested → processed). Overdue pending withdrawals get surfaced on the dashboard — unhappy clients waiting on money are your biggest churn risk.

## Client management

7. **Automated follow-up task engine.** When a client's `next_follow_up` date arrives, or a whale goes 7 days without contact, auto-create a task assigned to the retention agent. Today follow-up dates exist but nothing acts on them.

8. **Duplicate & merge clients.** Same person entered twice ("Bob Smith" / "bob smith") splits their deposits and breaks balances. Add a merge tool: pick two clients, preview the combined ledger, merge into one record.

9. **Client assignment rules & re-assignment.** Bulk "reassign clients" tool (e.g. agent leaves → move their 40 clients to another retention agent), plus an audit trail entry per move. Possibly round-robin auto-assignment for new activations.

10. **Weekly client digest email/summary.** Every Monday morning: auto-generated summary per agent — their clients' deposits last week, upcoming follow-ups, neglected whales, at-risk clients (AI scores). Shown in-app on login (no email infra needed to start).

11. **Deposit velocity & churn prediction per client.** Beyond the one-off AI analysis: automatically re-score every active client nightly (days since last deposit vs their usual cadence, balance trend) so the Clients list "at risk" badges are always fresh instead of needing a manual button click.

12. **Client documents & KYC status.** Attachments exist, but add a simple KYC checklist per client (ID verified, proof of funds, agreement signed) with a status badge on the list — critical for a finance operation.

## My recommendation

Start with **1, 2, 5, 7** — they directly connect money to client action: know who is profitable, know the real net numbers, and get told the moment a valuable client needs attention.

## Technical notes

- Profit-per-client reuses existing `toBase` FX conversion and commission tiers; fee % fields already exist in `company_settings` (`method_fee_wire_pct`, etc.).
- Auto-task engine and nightly re-scoring run as scheduled server jobs (pg_cron → public API route, pattern already used for recurring expenses).
- Merge tool updates `activation_id`/`customer_name` references across `revenue`, `withdrawals`, `tasks`, `client_communications`, `record_comments` in one transaction via a server function.
