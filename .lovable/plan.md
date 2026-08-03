# Implementation Plan — Items 1–11

Eleven improvements across daily speed, data trust, and team collaboration. Grouped into four batches so each lands working before the next starts.

## Batch A — Daily Speed (items 1, 2, 3)

**1. Global Quick-Create Speed Dial**
- Floating action button, bottom-right on every authenticated page, plus a `C` keyboard shortcut.
- Options: Income, Expense, Lead entry, Client activation, Withdrawal, Attendance, Task.
- Options are filtered by the user's existing nav permissions, so a non-admin only sees what they can access.
- Each option opens the relevant page with its create dialog already open (via a `?new=1` URL param the pages read).

**2. Mobile Card Views**
- `DataCardList` already exists and is used on 9 pages. Missing on: Leads, Expenses table body on small screens, Sources, Recurring, Reports tables.
- Add responsive card rendering to Leads, Sources, and Recurring; verify and tighten the existing card layouts elsewhere so no table forces horizontal scroll on phones.

**3. Bulk Actions on Revenue and Leads**
- Reuse the selection pattern already built on Expenses and Clients.
- Revenue: select rows → bulk delete, bulk reassign agent/affiliate, export selection, running total in the floating bar.
- Leads: select rows → bulk delete, bulk change source, export selection.

## Batch B — Records & Files (items 4, 7)

**4. Comment Threads on Records**
- New `record_comments` table: entity type, entity id, body, author, timestamps, workspace scoped.
- A reusable `CommentThread` panel added to Client detail, Revenue edit, Expense edit, and Employee detail.
- Shows author, relative time, edit/delete for own comments (admins can delete any).

**7. Document Attachments**
- New private storage bucket plus an `attachments` table: entity type, entity id, file path, filename, size, uploader.
- Upload/preview/delete widget added to Revenue, Expenses, Employees, and Clients.
- Files are workspace scoped; download uses short-lived signed links so nothing is publicly reachable.

## Batch C — Data Trust & Recurring Income (items 5, 6, 8)

**5. Data Quality Dashboard**
- New card on the Dashboard plus a `/data-quality` page.
- Checks: leads missing a source, revenue missing payment method, clients missing potential, clients missing a name, employees missing a team, employees missing salary, duplicate client names/phones, activations with no revenue.
- Each row shows a count and links directly to the filtered list so the issue can be fixed in place.

**6. Recurring Revenue**
- New `recurring_revenue` table mirroring `recurring_expenses`: amount, frequency, start/end date, next due date, agent, affiliate, method, notes.
- A "Recurring Income" section on the Recurring page (tabbed alongside recurring expenses).
- Auto-generation reuses the existing due-generation approach, so due entries appear in Income automatically.
- Feeds the Dashboard cashflow forecast on the inflow side.

**8. Custom Fields**
- New `custom_field_defs` table: module, label, key, type (text/number/date/select), options, sort order, active.
- Values stored in a `custom_fields` JSONB column on Leads, Employees, Clients, and Revenue.
- Admin UI in Settings to define fields; forms render them automatically; values appear in table columns and CSV/Excel exports.

## Batch D — Team & Permissions (items 9, 10, 11)

**9. @Mentions and Record-Linked Tasks**
- Typing `@` in a comment opens an employee picker; mentioning someone creates a notification (the `notifications` table already exists) and highlights the mention.
- Tasks gain optional links to a Revenue record or Lead entry in addition to the existing client/agent links.
- Due-date reminders: tasks due today or overdue generate a notification for the assignee on first load of the day.

**10. Action Permissions**
- Extend permissions beyond navigation with a second matrix per user: can delete records, can export data, can view/edit salaries, can approve withdrawals, can edit company settings.
- New `action_permissions` table; a `useCan(action)` hook gates buttons in the UI, with matching database rules so it is enforced server-side too, not just hidden.
- Admins keep full access; the matrix appears in User Management next to the existing nav toggles.

**11. Attendance Weekly Calendar**
- Replace the single-day view with a week grid: employees down the left, Mon–Fri across the top, click a cell to toggle present/absent.
- Keeps the existing day view as a toggle option.
- Right-hand summary shows, per employee, days absent this month and the running salary deduction, updating live as cells are toggled.

## Technical Notes

- Database work: 5 new tables (`record_comments`, `attachments`, `recurring_revenue`, `custom_field_defs`, `action_permissions`), one new storage bucket, one new JSONB column on four existing tables, and one new task-link column set. All workspace scoped with access rules matching the current model, and all covered by the existing audit-log triggers.
- No changes to existing commission, STD/FTD, or split-clock logic.
- Each batch will be verified against the running preview before moving to the next.

I will work through batches A → D in order.