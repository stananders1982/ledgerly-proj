# Ledgerly improvement roadmap

Based on the current app (dark SaaS control center, centralized business rules in `src/lib/rules.ts`, Leads/Clients/Revenue/Expenses/Reports/Performance modules), here are the highest-impact improvements grouped by effort and theme.

## Phase 1 — UX polish & productivity (small effort, high feel)

### 1.1 Global entity search in the command palette
- Today `⌘K` only searches pages and quick actions.
- Add live search across **clients**, **employees**, and **affiliates** by name, so a user can jump directly to `/activations?name=James` or `/employees/$id` without browsing.
- Reuse existing directory RPCs and route deep-link params already supported by `/activations`.

### 1.2 Theme toggle (light / dark / system)
- The app is currently dark-only. Add a toggle in the sidebar footer or profile menu, persisted to `localStorage`, using the existing CSS variables.
- This broadens usability for users who prefer light mode or print reports.

### 1.3 Keyboard shortcuts help panel
- Surface the shortcuts users already have (`⌘K`, row clicks) plus add new ones: `n` for "new record" on list pages, `?` to open the shortcuts panel.
- Keeps power users fast without cluttering the UI.

### 1.4 Richer empty states
- Replace text-only empty states on Revenue, Expenses, and Clients with contextual illustrations and a primary CTA.
- Reduces the "blank page" feeling for new workspaces.

### 1.5 Sticky bulk-action bar
- The Clients page already has multi-select. Make the bulk-action bar sticky when scrolling long tables, and extend the pattern to Employees, Revenue, and Expenses.

## Phase 2 — Data power tools (medium effort, high leverage)

### 2.1 Saved filter views
- Let users save date range + filter combinations (e.g. "This month's STD clients" or "Q3 CPA sources") to `localStorage`, similar to the report presets already in `/reports`.
- Apply to Leads, Clients, Revenue, and Expenses.

### 2.2 CSV bulk import
- Add an import wizard for **leads**, **revenue**, and **expenses` with column mapping and validation preview.
- Useful for migrating from spreadsheets or ad-network CSVs.

### 2.3 Duplicate-client detection
- When recording revenue or creating an activation, warn if a similar client name already exists (fuzzy match on `nameKey`).
- Prevents the same person appearing as multiple client records.

### 2.4 Column visibility / density toggle
- Let users hide columns they don't need and switch between "comfortable" and "compact" table density.
- Persist preference per page.

### 2.5 Recent items & bookmarks
- Add a "Recent" section to the command palette or sidebar showing last viewed clients/employees/reports.
- Optional star/bookmark per client for fast follow-up.

## Phase 3 — Business intelligence (medium effort, deeper insight)

### 3.1 Client lifecycle timeline
- On the client detail modal, show a visual timeline: lead entry → activation → each deposit → each withdrawal → status changes.
- Reuses existing `daily_lead_activations`, `revenue`, and `withdrawals` data.

### 3.2 Cash-flow forecast
- Project the next 90 days by combining recurring expenses (already stored) with trailing-30-day average revenue.
- Add a new dashboard mini-section or Reports tab showing expected burn/runway.

### 3.3 Employee goals / targets
- Add monthly FTD and revenue targets per employee.
- Show progress rings on the Performance page and in the employee detail page.
- Could be stored on `employees` (target_ftds, target_revenue) or a new `employee_monthly_targets` table.

### 3.4 Affiliate payout statement PDF
- Generate a monthly PDF statement per affiliate from the existing Payouts report data, ready to send.
- Builds on the affiliate payout logic already in `/reports`.

## Phase 4 — Operational workflows (larger effort, daily value)

### 4.1 Client tags / labels
- Add a `tags` array or `client_tags` table linked to activations.
- Predefined tags: "VIP", "Follow up", "At risk", "No answer".
- Filter by tags on the Clients page and show tags in the client modal.

### 4.2 Follow-up reminders / task list
- Allow users to schedule a follow-up date for a client and see a global "Due today" list.
- Could live as a new `/tasks` page or a dashboard widget.

### 4.3 Client communication log
- Log calls, WhatsApp, emails per client with timestamp and note.
- Appears in the client detail modal alongside deposits/withdrawals.

### 4.4 Revenue reconciliation
- Add a `reconciled_at` / `reconciled_by` flag to revenue rows so finance can mark deposits as verified against the payment processor.
- Filter "Unreconciled" on the Revenue page.

## Suggested first slice

If you want to pick one phase to start, **Phase 1.1 + 1.2 + 1.3** gives the biggest perceived upgrade for the least work: global search, theme toggle, and keyboard help make the app feel significantly more polished without touching business logic.

Which phase interests you most, or would you like me to implement the first slice?