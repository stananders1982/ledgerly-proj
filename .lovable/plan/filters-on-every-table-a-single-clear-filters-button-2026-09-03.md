# Filters on every table + a single "Clear filters" button

## Current state

Column filters (the search box / dropdown / date picker row under the headers) exist on 5 pages only: Income, Withdrawals, Expenses, Leads and Clients. A "Clear filters" button exists only on Clients, and it is a page-specific one.

These tables have no column filters at all:

- Lead sources
- Employees (list)
- Employee detail (its breakdown tables)
- Affiliates (list) and Affiliate detail
- Tasks
- Recurring (expenses/revenue)
- Activity feed
- Logs
- Performance
- Reports tables

## What will change

1. **Filters everywhere.** Every data table listed above gets the same filter row already used on Income and Clients: a text box for names/text columns, a dropdown for status/type/owner columns, and the date preset picker (Today, This week, This month, Custom range...) for date columns. Behaviour, look and persistence match the existing tables exactly, so nothing new to learn.

2. **One consistent "Clear filters" button.** A shared button appears in the toolbar of every filterable table. It shows the number of active filters, is greyed out when nothing is filtered, and clicking it clears everything for that table in one go: all column filters, the page's search box, and any status/date quick-filter chips the page has. The existing Clients page button is replaced by this shared one so it behaves identically everywhere.

3. **Filters keep being remembered per table** (as they are today), and the Clear button also wipes the remembered state so a cleared table stays cleared on the next visit.

## Technical notes

- Reuse `useTableToolbox` + `FilterRow` from `src/components/table-toolbox.tsx` for each page currently rendering a raw `<thead>`; define a `ColDef[]` with `key`, `label`, `filter` type and `value` accessor per column, and feed `tb.filtered` into the existing `useSort` pipeline.
- Add a `ClearFiltersButton` component to `table-toolbox.tsx` that takes the toolbox plus an optional `extra` reset callback (for page-level search/tab state) and removes the persisted `table-filters:<key>` entry on clear.
- Pages already on the toolbox (Income, Withdrawals, Expenses, Leads, Clients) get the shared button added; Clients' bespoke clear logic is passed in as the `extra` callback so its chips/search reset too.
- Where a page's table shares columns with an existing one, reuse the same `filter` types so option lists stay consistent.
- No data/query or permission changes; this is presentation only.
