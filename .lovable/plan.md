# Improvement Ideas for Ledgerly

I explored the current codebase (dashboard, leads, sources, revenue, expenses, recurring, withdrawals, employees, performance, attendance, reports, users, auth/2FA). Below are concrete improvement opportunities grouped by impact. Pick the ones you want and we’ll implement them next.

## 1. Data Quality & Validation
- **Duplicate prevention**: add unique constraints/indexes on `daily_lead_entries (entry_date, source_id, campaign)` and `revenue (date, customer_name, amount)` to avoid accidental double-entry.
- **Required fields enforcement**: make `source_id` required on lead entries and `employee_id`/`team` required on employees at the DB level.
- **Soft deletes**: replace hard `DELETE` on employees/lead sources with `deleted_at` flags so historical reports stay intact.

## 2. Employee & Payroll Experience
- **Bulk attendance**: a single “Mark attendance for today” page with checkboxes for all employees instead of one-by-one entry.
- **Payslip export**: generate PDF payslips per employee per month from the Performance / Employee Detail page.
- **Commission statement**: a per-employee breakdown showing every revenue line that contributed to that month’s commission.
- **Working-days calendar**: let admins define holidays/non-working days so attendance/salary deductions are accurate.

## 3. Lead & Source Intelligence
- **Lead source health score**: a single score per source combining reporting rate, activation rate vs. expected, CPA savings, and ROI.
- **Source-level cohort retention**: track how many activated leads from each source deposit again in week 2, 4, 8.
- **Auto-archive inactive sources**: hide sources with no entries in the last 90 days from dropdowns unless toggled.
- **Lead import (CSV/Excel)**: bulk upload daily lead entries instead of manual daily rows.

## 4. Revenue & Affiliates
- **Revenue reconciliation**: flag revenue entries whose `customer_name` does not match any activated lead.
- **Affiliate statement page**: a dedicated `/affiliates/:id` view with lifetime revenue, withdrawals, net, and player value.
- **Chargeback/return tracking**: add a `revenue_returns` table so net revenue is revenue minus returns.
- **Invoice generation**: create simple affiliate/income invoices from revenue entries.

## 5. Reporting & Analytics
- **Scheduled reports**: email or export a P&L / Marketing report automatically every Monday / 1st of month.
- **Saved report presets**: remember commonly used date ranges + filters per user.
- **Comparative period charts**: show current month vs. previous month / same month last year on the dashboard.
- **Drill-down**: click any dashboard KPI to jump to the filtered source page / report behind it.

## 6. Operations & UX
- **Global search**: a command palette (Cmd+K) to jump to any employee, lead, source, or revenue entry.
- **Recent activity feed**: a sidebar or page showing who created/edited what in the last 24 hours.
- **Role-based home pages**: Conversion agents land on `/activations`, Retention on `/performance`, Admin on dashboard.
- **Mobile polish**: many wide tables overflow horizontally; add card-based mobile views for Leads, Performance, Reports.

## 7. Automation
- **Recurring expense generation scheduler**: replace the client-side `useEffect` trigger with a backend cron so the dashboard never misses a due expense.
- **Auto-mark answered**: if a revenue deposit is recorded for a lead, automatically set `answered = true` on the activation.
- **Low-balance alerts**: notify when an affiliate’s net balance turns negative or an employee’s attendance deduction exceeds a threshold.

## 8. Security & Compliance
- **Audit log table**: track every insert/update/delete with `user_id`, `table`, `record_id`, `old_value`, `new_value`, `timestamp`.
- **Session timeout**: enforce idle timeout and concurrent session limits for sensitive admin actions.
- **Backup/export all data**: one-click full database export for the admin.

## Suggested First Priority (quick wins + high value)
1. Bulk attendance entry.
2. Auto-mark activation as `answered` when revenue is recorded.
3. Drill-down links from dashboard KPIs.
4. Duplicate-prevention unique indexes.
5. Affiliate detail statement page.

Which direction interests you most? We can turn any of these into a detailed build plan.