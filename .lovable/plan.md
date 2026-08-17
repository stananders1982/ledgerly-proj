# Compact Navbar Plan

## Goal
Make the left navigation shorter and more compact so the main content gets more room and the app feels less dense.

## Direction
Implement a **compact icon-only rail** as the default sidebar state, with tooltips on hover and the ability to expand back to the full labeled sidebar. Keep the existing sidebar groups, mobile bottom nav, and permission-based visibility untouched.

## Changes

### 1. Default the sidebar to collapsed icon-rail
- In `src/routes/_authenticated/route.tsx`, change `SidebarProvider` default state so the sidebar loads as a narrow rail instead of the full expanded panel.
- Persist the user’s chosen state (collapsed/expanded) across sessions, probably via `localStorage` keyed under `ledgerly-sidebar-state`.

### 2. Improve the icon-only rail UX
- In `src/components/app-sidebar.tsx`, ensure every nav item still shows a tooltip with its full label and keyboard shortcut when the sidebar is collapsed.
- Add a visible active-state indicator on the rail (e.g., a subtle left-border or background pill) so the current page is obvious even without labels.
- Keep the logo and footer actions visible in the collapsed state in a minimal form.

### 3. Tighten the expanded sidebar spacing
- Reduce vertical padding on nav items and group headers in expanded mode (e.g., from `py-2` to `py-1.5` or `py-1`).
- Keep the group accordions but reduce group label size and spacing so the full menu takes less vertical room.

### 4. Provide a compact-mode toggle
- Add a small toggle button on the rail (or next to the existing `SidebarTrigger`) that lets the user switch between compact and expanded.
- The toggle should sync with the persisted state.

### 5. Ensure mobile behavior is unchanged
- On mobile, continue using the `MobileBottomNav` and the sheet-style sidebar; the compact rail only applies to desktop/tablet.

## Out of scope
- Removing or hiding nav items.
- Restructuring the nav groups.
- Changing the mobile bottom navigation.

## Files likely to be changed
- `src/routes/_authenticated/route.tsx`
- `src/components/app-sidebar.tsx`
- `src/components/ui/sidebar.tsx` if needed for rail styling
- `src/styles.css` for any new rail/accent tokens if required

## Verification
- Preview the dashboard and confirm the sidebar loads as a narrow rail.
- Hover a nav item and confirm the tooltip appears with the label.
- Click the expand toggle and confirm the full sidebar returns.
- Check that the active page is visibly highlighted in the collapsed state.
