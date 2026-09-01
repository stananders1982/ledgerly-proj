# A dense "Grid" view for Clients

Add a third view to the Clients page — next to List and Table — that works like an operator console: one tight row per client, a search box under every column header, and the fields you change most often editable straight in the row.

## The view switch

The toolbar becomes List / Table / Grid. Your current List and Table views stay exactly as they are. The choice is remembered per user, as it already is today.

## What the Grid row shows

Same columns you already have — nothing new invented, no online dot, no calls count, no last-comment column:

Select · Favourite · Name (opens the profile) · Contact icons · Activated date · Source · Retention agent · Conversion agent · Status · Answered · Balance · Potential · Tags · Actions

Rows are compact (single line, no wrapping), sticky header, horizontal scroll with the checkbox and name columns pinned left so you never lose track of who a row belongs to.

## Filter row under the headers

Directly beneath the header there is a filter row:

- Text columns (name, source) get a small search box that filters as you type
- Status, Retention agent, Conversion agent and Answered get compact dropdowns
- Balance gets a min/max style numeric filter
- A "Clear filters" control appears as soon as anything is set, and the result count updates in the toolbar

These filters combine with the page's existing search, date range and KPI-card filters rather than replacing them.

## Editable in the row

- **Status** — hot / warm / cold / dormant / churned dropdown, saves on change
- **Assigned to** — retention agent and conversion agent dropdowns, saves on change
- **Answered** — one-click toggle (same behaviour as the list view)
- **Contact** — call, WhatsApp and email icon buttons

Each save is optimistic with a toast, and reverts if it fails. Retention agents in scoped mode keep the same restriction they have today: they can't reassign the retention agent.

## Technical notes

- New component `src/components/clients-grid.tsx` holding the grid table, the filter row and the inline editors; `activations.tsx` renders it when `viewMode === "grid"` and the persisted state type widens to `"list" | "table" | "grid"`.
- Column filter state lives in the grid component (persisted via `usePersistedState`) and narrows `pageItems` before pagination so counts and exports stay consistent.
- Inline edits reuse the existing `daily_lead_activations` update mutation pattern already used by the answered toggle and detail sheet; no schema or policy changes.
- Sticky/pinned columns reuse the existing `TableFrame` + `pin-left` conventions.
