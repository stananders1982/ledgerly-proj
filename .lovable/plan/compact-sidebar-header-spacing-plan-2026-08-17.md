# Compact Sidebar Header Spacing Plan

## Goal
Reduce the vertical space in the left sidebar header so the app feels more compact and the nav items start higher.

## Direction
Tighten the header block in `src/components/app-sidebar.tsx` without changing the elements, logo, company switcher, or search button. This only affects the expanded sidebar; the collapsed icon rail stays the same.

## Changes

### 1. Reduce the logo block padding
- In `src/components/app-sidebar.tsx`, change the logo container from `px-2 py-3` to `px-2 py-2` (or `py-1.5` if needed) so the top/bottom spacing is tighter.
- Keep the logo icon at `h-8 w-8` and the text as-is.

### 2. Reduce the gap between header elements
- The header currently has three vertical blocks: logo, company switcher, and search button. Ensure they sit closer together without adding visible whitespace.
- If the `SidebarHeader` component adds default padding, reduce it (or use `className` on `<SidebarHeader>`) so the whole header area is compact.
- Keep the company switcher unchanged internally; only reduce its top/bottom spacing or margins.
- The search button currently has `mb-1`. Reduce or remove that margin so the search button sits directly above the `SidebarContent` separator.

### 3. Keep mobile and collapsed states unchanged
- The compact rail header should continue to render just the icon with the existing spacing.
- No changes to mobile bottom navigation.

## Out of scope
- Changing the sidebar width.
- Removing the logo, company switcher, or search button.
- Restructuring nav groups or nav items.
- Changing mobile navigation.

## Files likely to be changed
- `src/components/app-sidebar.tsx`
- Possibly `src/components/ui/sidebar.tsx` if the `SidebarHeader` has default spacing that needs adjusting.

## Verification
- Preview the dashboard and confirm the sidebar header is visibly tighter.
- Confirm the logo, company switcher, and search button still align and are readable.
- Confirm the collapsed rail is unchanged.
- Confirm no mobile regression.
