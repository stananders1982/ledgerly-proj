# Admin Operations Dashboard

## Goal
Create a dedicated admin-only workspace that brings deposit requests, confirmed client deposits, other income, withdrawals, leads, and agent performance into one filterable view.

## Page structure
Add a new **Admin Overview** page at `/admin-overview`, linked near the top of the Admin navigation group.

The page will contain:

1. **Global filter bar**
   - Date range: Today, Week, Month, Quarter, Year, Custom
   - Agent selector
   - Search by client or lead name
   - Status selector that adapts to the selected dataset
   - Source selector for lead-related views
   - Clear filters action

2. **Headline totals**
   - Deposit requests awaiting approval: count and requested value
   - Deposits awaiting funds: count and requested value
   - Confirmed client deposits: count and gross value
   - Other income: count and gross value
   - Withdrawals: count, total value, and pending/overdue counts
   - Leads: received, valid, activated/FTD, and conversion rate
   - Active agents: total, conversion team, and retention team

3. **Operational attention row**
   - Pending deposit approvals
   - Approved requests still awaiting funds
   - Overdue pending withdrawals
   - Unassigned leads/clients
   - Each item links directly to its existing page with the relevant filter where supported

4. **Tabbed records area**
   - **Requests:** client, requested amount, date, agent, status, invoice/bank state
   - **Client deposits:** only income rows linked to confirmed deposit requests
   - **Other income:** income rows not linked to a confirmed request
   - **Withdrawals:** client, amount, date, agent, status, affiliate
   - **Leads:** lead/source, status, assigned agent, created date, activation state
   - **Agents:** active status, team, leads, activated leads/FTDs, deposits, withdrawals, and conversion rate

The global filters apply to totals and every tab. Each tab keeps compact dataset-specific filters and sortable columns where useful.

## Data rules
- **Requests** come from `deposit_requests` and retain their existing lifecycle: pending, approved, confirmed, rejected, cancelled.
- **Confirmed client deposits** are revenue rows linked by a confirmed request’s `revenue_id`.
- **Other income** is revenue not linked to a confirmed deposit request, preventing double counting.
- **Activated leads and FTDs are the same metric** throughout the page.
- Monetary totals convert through the existing shared display-currency utilities.
- Agent totals account for primary and split-agent assignments where applicable.
- Queries remain workspace-scoped by the existing database security policies.

## Access control
- Add `Admin Overview` as an admin-only navigation item.
- Hide the page from non-admin navigation and redirect non-admin direct visits to the regular dashboard.
- This page is read-only; approvals, edits, deposits, and withdrawals continue in their existing workflows so business rules are not duplicated.

## Technical details
- Create a focused route for `/admin-overview` with complete route metadata.
- Build reusable internal summary/table sections rather than expanding the already large main dashboard file.
- Fetch the six datasets with TanStack Query using stable workspace-aware query keys and the existing `fetchAll` helper where pagination is needed.
- Reuse current date range, status badge, table, pagination, currency, employee link, empty, loading, and error components.
- Preserve direct links to client and employee detail pages.
- No database migration is required for this read-only consolidated view.

## Verification
- Confirm only admins can see and open the page.
- Reconcile each headline total against its existing source page for the same date range.
- Confirm client deposits and other income are mutually exclusive and sum to total income.
- Verify agent, status, source, search, and date filters update both totals and rows consistently.
- Verify activated lead totals use the FTD definition everywhere.
- Test loading, empty, and error states plus desktop and mobile layouts.
