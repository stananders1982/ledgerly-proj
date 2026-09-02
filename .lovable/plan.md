# Agents see only their own book

Today the database still lets any signed-in workspace member read every client, every income row and every withdrawal — the "only my clients" behaviour on the Clients page is just a filter in the interface. This change moves the rule into the database, so a conversion or retention agent genuinely cannot reach another agent's data, and adds a **Request deposit** button on the client profile.

## Who sees what

- **Admin / Manager** — unchanged, full workspace access.
- **Agent (conversion)** — only leads and clients they are the conversion agent for, income and withdrawals credited to them, and their own deposit requests.
- **Retention agent** — only clients allocated to them, income and withdrawals credited to them, and their own deposit requests.
- Anything not theirs simply doesn't exist for them: it disappears from lists, KPI cards, filters, dropdowns, search and exports, because the numbers are computed from the rows they are allowed to read.

## Request deposit from the client page

The client profile gets a **Request deposit** button next to the call / WhatsApp / email actions. It opens the same deposit-request form already used on the Deposit Requests page, pre-filled with that client (name, agent, age, country, city), so an agent never has to leave the client to raise a request. Admin approval and the existing reminder flow are untouched.

## What stays the same

- Deposit Requests is already own-scoped — agents see their own, admins see everything.
- Page-level access (which menu items a role sees) and the Permissions matrix are unchanged.
- Tasks, Performance, Dashboard, Reports and exports are out of scope for this change; they will keep behaving as they do now, and will naturally show less once the underlying rows are restricted.

## Technical notes

Current state confirmed by reading the live policies:
- `daily_lead_activations` and `withdrawals` have blanket `company members read` SELECT policies.
- `revenue` has a broad `members with income page read revenue` policy keyed on the `revenue` nav permission.
- `deposit_requests` is already scoped to `requested_by`; `leads` is already scoped for `role_key = 'agent'` (including unassigned leads).

Migration:
- Add `app_private.my_employee_id()` (security definer: the caller's `employees.id` in the current company) and `app_private.is_scoped_member()` (true when the caller is not admin and `company_users.role_key` is `agent` or `retention`).
- `daily_lead_activations`: replace the blanket SELECT with (a) full read for admin/manager, (b) scoped read where `employee_id = my_employee_id()` or `conversion_employee_id = my_employee_id()`. Narrow the `ALL` write policy the same way so scoped users can only update their own clients.
- `revenue`: rewrite `members with income page read revenue` to also require, for scoped members, `employee_id` or `employee_id_2 = my_employee_id()` (keep the existing `created_by = auth.uid()` path).
- `withdrawals`: same treatment on SELECT and the `ALL` write policy.
- `leads`: extend the scoped SELECT to also cover `role_key = 'retention'`, and drop the "unassigned leads are visible to every agent" clause so an agent sees only leads assigned to them.

Frontend:
- `src/lib/my-employee.ts` gains `isScoped` (role is agent/retention) so pages can hide agent pickers and bulk-reassign controls rather than showing them broken.
- `src/routes/_authenticated/revenue.tsx` and `withdrawals.tsx`: hide employee filters, "assign employee" bulk actions and cross-agent totals for scoped users; keep the queries as-is since RLS now does the filtering.
- Employee dropdowns fed by `list_employees_directory()` collapse to the signed-in agent for scoped users.
- Extract the deposit-request form from `deposit-requests.tsx` into `src/components/deposit-request-dialog.tsx` (same fields, same mutation) and mount it from `clients.$id.tsx` with the client pre-selected; the Deposit Requests page reuses the extracted dialog.
- Verification: sign in as a retention agent and a conversion agent in the preview and confirm Clients, Income and Withdrawals show only their rows with no permission errors.
