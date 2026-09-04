# Leads table: remove "Full Name 2" + add timeframe filter

## 1. Remove "Full Name 2" from the leads table

In `src/components/leads-grid.tsx`:

- Delete the `Full Name 2` column header, its body cell (`noteVal(l, "Also known as ")`), and its entry in the column/filter definitions (which also removes its filter input from the filter row).
- Shrink the table's `min-w-[2900px]` accordingly.

No other table renders this column (checked: only the leads grid does).

The CSV import template keeps accepting the `Full Name 2` column — it still gets stored in the lead's notes as "Also known as …", so existing exports keep importing without skips; it just won't be a table column anymore.

## 2. Timeframe picker for the leads table

The page's existing date picker (Today / Week / Month / Quarter / Year / Custom) only filters the daily-numbers section — the individual leads table below ignores it. Changes:

- `src/components/date-range-picker.tsx`:
  - Add a **Yesterday** option to `RangeKey` + `getRange` (yesterday 00:00 → 23:59).
  - Add an optional `showAll` prop that renders an extra **All** tab; `getRange("all")` returns an open range (no filtering).
- `src/components/leads-grid.tsx` (individual leads table):
  - Add the `DateRangePicker` (with `showAll`) to the toolbar, default **All**, persisted in local storage like the other filters.
  - Filter rows by each lead's created date within the chosen range.
  - "Clear filters" also resets the timeframe back to All.

Result: on the leads page you can switch the table between All, Today, Yesterday, This week, This month, Quarter, Year, or a Custom date range.

## Technical notes

- `RangeKey` gains `"yesterday" | "all"`; existing persisted values on other pages keep working unchanged — other pages won't show the All tab (it's behind `showAll`).
- Filtering is client-side over the already-fetched rows, so it's instant.
