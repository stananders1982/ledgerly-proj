# Departments and role-based access for new users

Right now the **Add user** dialog only asks for name, email, password, an Admin switch and a manual page checklist. It never sets the person's role, so every new account lands on the default role `agent` regardless of what pages you tick, and there is no place to say which department (Retention / Conversion / Management) they belong to. This plan fixes both, and makes a Retention login show only the retention pages by default.

## 1. Role and department on the Add user dialog

The dialog gets two new pickers above the page list:

- **Role** — Admin, Manager, Agent, Retention, plus any custom roles created in Permissions. Choosing a role writes it onto the user's workspace membership, so all the role permissions already configured in the Permissions matrix apply immediately.
- **Department** — Retention (R), Conversion (C) or Management (M), the same three teams the Employees page uses. Optional: "No department".

Picking a department also creates (or links) the matching employee record with that team, so the person shows up in agent pickers, performance and payroll without a second manual step. If an employee with the same email already exists, it is linked instead of duplicated.

The page checklist stays, but becomes an **override**: it pre-fills from the chosen role and is only saved for pages you deliberately change. Choose "Retention" and the retention page set is ticked for you.

## 2. Same controls when editing a user

The **Edit access** dialog gets the same Role and Department pickers, showing what the user has today, so you can move someone into Retention later without going to a separate page.

## 3. Users list shows role and department

The list currently shows only Admin / User. It will show the real role badge (Admin, Manager, Agent, Retention, custom) and a department column (R / C / M), so you can see the team layout at a glance.

## 4. What a Retention user sees

Retention already has a defined page set in the workspace: Dashboard, Clients, Income, Withdrawals, Tasks, Performance. With the role actually assigned at creation, a retention login will see exactly those pages in the sidebar — everything else (Leads, Sources, Expenses, Reports, Employees, Settings, admin pages) is hidden, and direct URLs are blocked by the existing permission checks.

The default retention page set will be reviewed and confirmed in the Permissions matrix as part of this change; you can adjust it there at any time, and per-person tweaks still work through the page checklist.

## Technical notes

- `createAppUser` in `src/lib/admin-users.functions.ts` gains `role_key` and `department` inputs: it sets `company_users.role_key` (today it relies on the column default `'agent'`), and upserts an `employees` row with `team` R/C/M linked by email. Admin toggle keeps writing the `admin` entry in `user_roles`.
- `updateUserPermissions` gains the same two fields for the edit dialog.
- Nav checkboxes are written to `nav_permissions` only where they differ from the role's rows in `role_permissions`, so role changes are not silently overridden by stale per-user rows. Existing per-user rows for the user are cleared on save first.
- `listAppUsers` returns `role_key` and the linked employee's `team` for the new list columns.
- No schema change is needed: `company_users.role_key`, `employees.team` and `employees.profile_id` already exist. Runtime permission resolution (`effective_permission` → override, then role rows, then legacy per-user rows) is unchanged.
- Verification: `tsgo --noEmit`, then a Playwright pass creating a Retention user and confirming the sidebar shows only the retention pages.
