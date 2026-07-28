# Design overhaul plan

Four workstreams, implemented in order. No backend changes; existing dark glassmorphism theme and color tokens are kept.

## 1. Grouped sidebar navigation

Replace the flat 14-item list with collapsible groups:

```text
Overview     Dashboard
Operations   Leads · Clients · Sources · Income · Withdrawals · Expenses · Recurring
People       Employees · Performance · Attendance
Analytics    Reports · Affiliates
Admin        Users
```

- Add a `group` field to each entry in `src/lib/nav-items.ts`.
- Render each group as a collapsible `SidebarGroup` with a chevron; the group containing the active route stays open.
- Preserve existing permission filtering — a group renders only if the user can see at least one of its items.
- Persist open/closed state in localStorage.
- In icon-collapsed mode, keep flat icons with tooltips (no nested dropdowns).

## 2. Unified page header + command palette

**PageHeader** — extend the existing component so every page uses one layout:

```text
[eyebrow + title + description]      [search] [date range] [primary action]
```

Applied to Leads, Clients, Sources, Income, Withdrawals, Expenses, Recurring, Employees, Performance, Attendance, Reports, Affiliates, Users. Mobile: title stacks above controls using the grid pattern.

**Command palette** — `Cmd/Ctrl + K`, plus a search button in the sidebar header.
- Sections: Pages (all nav items the user can access), Quick actions (Add income, Add expense, Record withdrawal, Mark attendance).
- Built with the existing shadcn `CommandDialog`.

## 3. Table polish + badges

- Sticky, subtly tinted table headers with the existing sort affordance.
- Row hover state; action buttons (Edit/Delete/View) fade in on hover, always visible on touch.
- Right-align numeric columns and use tabular figures so amounts line up.
- Consistent `StatusBadge` component for: Active/Inactive, Answered/Unanswered, Low/Mid/High potential, CPL/CPA pricing model, Paid/Pending.
- All badge colors from existing `success` / `warning` / `destructive` / `muted` tokens.

## 4. Mobile cards + loading and empty states

- Below `md`, wide tables (Income, Expenses, Withdrawals, Clients, Employees, Affiliates, Performance) render as stacked cards: primary label on top, key figures as label/value pairs, actions in a row.
- Skeleton loaders matching final layout for KPI cards, tables, and charts instead of blank space.
- Standardized `EmptyState` usage everywhere: icon, one-line explanation, primary CTA.

## Technical notes

- Only existing shadcn primitives are used: `Sidebar`, `Collapsible`, `CommandDialog`, `Badge`, `Skeleton`, `Card`, `Tooltip`.
- New shared components: `nav-groups` config, `command-palette.tsx`, `status-badge.tsx`, `table-card-list.tsx`, `table-skeleton.tsx`.
- Sidebar width classes use explicit `var(--sidebar-width)` syntax per Tailwind v4.
- No changes to queries, RLS, or calculation logic.