# Dashboard section visibility per user and role

Today access control stops at the page level: Jack and Alex either see the Dashboard or they don't. This adds a second level — which *blocks inside* the dashboard each role or person can see.

## Sections you'll be able to toggle

Each of these becomes an on/off switch:

- Alerts (anomaly banners)
- Daily digest
- Ask your data (AI chat box)
- Hero KPIs (Net profit, Revenue, Expenses, Activation rate)
- Business engine (Acquisition / Profitability / Operations)
- Revenue vs expenses chart
- Lead funnel
- Lead source performance
- AI insights
- Cashflow forecast
- Data quality
- Activity feed
- Expense breakdown

## Where you control it

On **Permissions** (`/users/permissions`), a new **Dashboard** tab next to Page Access and Action Permissions, using the same matrix: one row per section, one column per role, plus the existing Reset-to-defaults per role.

For one specific person, the existing **Edit overrides** drawer gets a "Dashboard sections" group, so you can give Alex one extra section (or take one away) without touching his role.

Defaults, applied when nothing is set:
- Admin: everything.
- Manager: everything.
- Agent: alerts, digest, hero KPIs, business engine, lead funnel, source performance, activity feed. No money-heavy blocks (revenue/expenses chart, cashflow forecast, expense breakdown, AI insights, ask box).
- Retention: alerts, digest, hero KPIs, business engine, lead funnel, activity feed, data quality.

## Behaviour

- The dashboard renders only the sections the signed-in user is allowed to see; hidden ones disappear cleanly (no empty gaps, grid rows collapse).
- If a user ends up with no sections at all, the dashboard shows a short "Nothing has been shared with you yet" message instead of a blank page.
- Admins always see everything — their column stays locked, as with the other matrices.
- Changes are picked up on the next load/refresh of the dashboard, and are recorded in the audit log like all other permission changes.
- The Admin Assistant chat keeps working for page/action changes; dashboard sections are managed from the Permissions page in this change.

## Technical notes

- No migration. Dashboard sections reuse `role_permissions` / `user_permission_overrides` with namespaced `nav_key` values (`dash:kpis`, `dash:cashflow`, …), so `effective_permission()`, `my_permissions()`, RLS and the audit triggers all apply unchanged.
- New `src/lib/dashboard-sections.ts`: `DASHBOARD_SECTIONS` (key, label, hint) plus `defaultDashboardAllowed(roleKey, key)`; imported by `permission-defaults.ts` so role resets include the new keys.
- `PermissionMatrix` gains a `kind: "dashboard"` variant reading from the same `role_permissions` query; `navKeysForReset()` extends with the dashboard keys.
- `useMyPermissions()` gains a `dashboardSections: Set<string>` derived from `nav_key` values with the `dash:` prefix, plus a `useCanSeeSection(key)` helper (admins always true).
- `src/routes/_authenticated/index.tsx` wraps each section in the guard; per-section data queries are gated with `enabled` so hidden blocks don't fetch.
- `user-overrides-drawer.tsx` renders the dashboard keys as an extra collapsible group alongside pages and actions.
- Visibility here is presentation only — RLS on `revenue`, `expenses` etc. remains the real boundary.
