# Compact Navigation Plan

## Goal
Reduce the crowded sidebar without removing any destination or changing access permissions.

## Navigation model
Keep only five primary sections visible in the expanded sidebar:

- Overview
- Operations
- People
- Analytics
- Admin (only when permitted)

Selecting a section opens its first permitted page. The pages within that section appear in a compact contextual navigation row beneath the existing top header. The active page stays clearly highlighted.

```text
Sidebar                 Context bar
Overview                Dashboard | Ask Your Data
Operations              Leads | Clients | Sources | Income | More ▾
People                  Employees | Performance | Attendance
Analytics               Scenarios | Dashboards | Reports | More ▾
Admin                   Users | Permissions | Assistant | More ▾
```

Long sections will show the most-used destinations directly and place the remainder in a labeled “More” menu. This avoids replacing one crowded vertical list with an overflowing horizontal list.

## Changes

### 1. Centralize section navigation
- Extend the existing navigation definitions so each section has an icon and a default destination.
- Continue using the current permission filtering before showing sections or page links.
- Determine the active section from the current route, including detail pages such as client and employee profiles.

### 2. Simplify the desktop sidebar
- Replace all individual page rows with the five section-level entries.
- Preserve the Ledgerly brand, company switcher, search, setup guide, sign out, active state, and icon-only collapsed rail.
- Clicking a section routes to its first page the current user can access.
- Keep the sidebar visually consistent with the current dark theme rather than adopting a separate redesign.

### 3. Add contextual page navigation
- Add a slim secondary row below the existing application header.
- Show only pages from the active section that the user is allowed to access.
- Keep the most important pages visible and place overflow destinations in a “More” dropdown.
- Highlight the active page and support direct navigation without changing route URLs.
- Hide the row when the active section has only one permitted destination.

### 4. Preserve mobile behavior
- Keep the existing mobile bottom navigation as the primary mobile control.
- Make the contextual row horizontally scrollable on small screens so permitted pages remain reachable without cramped labels.
- Keep the existing mobile sidebar sheet available through “More.”

## Technical details
- Reuse the existing `NAV_GROUPS`, `NAV_ITEMS`, permission rules, TanStack links, sidebar components, and dropdown components.
- Add a small reusable contextual-navigation component and mount it in the authenticated layout.
- Avoid new routes, database changes, or changes to page content.
- Preserve current active-route behavior and collapsed sidebar tooltips.

## Verification
- Verify admin, manager, agent, and retention navigation only exposes permitted sections and pages.
- Verify every existing destination remains reachable.
- Verify detail routes select the correct parent section.
- Verify expanded, collapsed, and mobile navigation states.
- Verify direct URLs, browser back/forward navigation, search, setup guide, and sign out still work.
