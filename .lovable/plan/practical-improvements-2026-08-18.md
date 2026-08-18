# Practical Improvements

The app is already feature-complete. These are small, high-value fixes that remove daily friction rather than adding new modules.

## 1. Permissions apply without re-login
Today permissions load once at sign-in, so when you change what Alex or Jack can see they must sign out and back in. Refetch permissions on window focus and after an admin saves the permission matrix, so changes land within seconds.

## 2. Sticky filters per page
The date range, search text and column filters reset every time you navigate away. Persist each page's filter state (date range, search, page size, visible columns) in the URL and local storage so returning to Leads or Revenue keeps your last view.

## 3. Real empty states with a next action
Pages like Goals show "No goals for this month", which reads as broken. Every empty table gets a one-line explanation plus the primary button (Create goal, Add lead, Record revenue) so the page is never a dead end.

## 4. Inline edit for the fields you change most
Status, agent assignment, qualified/reported toggles currently require opening a dialog. Make those cells editable in place on Leads, Clients and Revenue with optimistic update and undo toast.

## 5. Faster page loads on big tables
Move the heavy list pages to server-side pagination + count instead of pulling every row and filtering in the browser. Keeps Leads and Revenue snappy as data grows.

## 6. Duplicate detection when adding leads and revenue
Warn (not block) when a new lead matches an existing name/phone/email in the same company, or when a deposit matches an existing amount+customer+date. Catches most of what the Data Quality page finds after the fact.

## 7. Error and loading polish
Replace blank flashes with skeleton rows, and show a retry-able error card instead of a silent empty table when a query fails.

## 8. Mobile pass on the daily screens
Attendance, Leads and Revenue are the ones used from a phone. Card layout under 768px instead of a horizontally scrolling table.

## Technical notes
- Permission freshness: React Query `refetchOnWindowFocus` on the permissions query plus `queryClient.invalidateQueries` after the permission-matrix mutation; no schema change.
- Filter persistence: a shared `usePersistedFilters` hook writing to search params + `localStorage`, adopted by the table toolbox in `src/components/table-toolbox.tsx`.
- Server pagination: `.range()` with `count: 'exact'` on the Supabase queries feeding `src/components/pagination.tsx`.
- Duplicate checks: a read query before insert, surfaced as a confirm dialog; no new tables.

## Suggested order
1, 3, 7 first (quick, visible), then 2 and 4, then 5, 6, 8.
