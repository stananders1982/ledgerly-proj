## Goal

Let several companies use this app, each seeing only its own data, without losing anything that exists today.

## About "separate database"

A literal separate database per company isn't something this backend can provision per customer — it would mean a separate deployment, separate login, and separate maintenance for every company, and every future change would have to be applied N times.

The standard way to get the same guarantee is **one database, a `company_id` stamped on every row, and database-level access rules (RLS) that make it physically impossible for a query to return another company's rows** — even a bug in the app code can't leak across companies, because the database refuses. This is what banks and most SaaS products use, and it keeps one codebase.

I'll build it that way. If you later want a company on truly isolated infrastructure, the same code can be deployed to a second instance for that one customer.

## How it will work

- A new **Companies** table. All existing data is assigned to one company (your current business) — nothing is deleted or moved.
- Every user belongs to exactly one company, set when you invite them.
- **Super admin** (you) is not tied to a company: you get a company switcher in the header and an admin panel to create companies, invite their first admin, and see any company's data.
- New companies are **invite only** — no public signup.
- Login stays the same (email + password). No need to type a company name: the company is derived from the user's account. Only the super admin sees the switcher.

```text
Super admin ──> Company switcher ──> any company's data
Company admin ──> their company only (manages their own users)
Regular user ──> their company only, limited nav items (as today)
```

## Plan

**1. Database foundation**
- `companies` table (name, slug, active, created_at).
- `company_users` table linking each auth user to a company + their role in it.
- Add `company_id` to every business table: affiliates, affiliate_events, affiliate_guarantee_periods, employees, attendance, leads, lead_sources, daily_lead_entries, daily_lead_activations, revenue, withdrawals, expenses, expense_categories, recurring_expenses, notifications, nav_permissions.
- Backfill all existing rows with the default company, then make `company_id` required.

**2. Isolation rules**
- Helper functions `current_company_id()` and `is_super_admin()` (security definer, no recursion).
- Rewrite every table's RLS policy to add `company_id = current_company_id() OR is_super_admin()`, keeping today's admin/non-admin distinctions intact so Jack and the admin behave exactly as now.
- Existing triggers and reporting functions (commission, affiliate recompute, recurring expense generation, deposit alerts, directories) updated to be company-scoped.

**3. App changes**
- Company context in the app: current company id available everywhere; every insert stamps it automatically.
- Header company switcher, visible to super admin only.
- Super Admin panel: list/create companies, invite the first admin per company, deactivate a company, impersonate/view a company.
- Existing Users page becomes per-company: a company admin manages only their own users and nav permissions.

**4. Safety**
- Migration is additive and reversible in stages; no data is deleted.
- After migration I'll verify row counts per table match before/after, and check that a non-super-admin user cannot read another company's rows.

## Technical notes

- Isolation is enforced in Postgres RLS, not in app code, so server functions and any future endpoint inherit it.
- `current_company_id()` reads from `company_users` for `auth.uid()`; for a super admin it reads a selected-company claim/setting so the switcher works without weakening policies.
- Views `employees_directory` / `affiliates_directory` get company filtering too.
- Report/dashboard queries need no rewrite — RLS filters them automatically — but explicit `company_id` filters will be added where queries aggregate across joins.

This is a large change touching every table and most pages; I'd do it in the order above so the app stays working throughout.
