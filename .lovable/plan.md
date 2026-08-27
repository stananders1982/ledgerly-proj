# Readable tables everywhere + complete header dropdowns

## The problem

On the Clients page the table wrapper is set to `overflow-hidden`, so any column past the window edge is simply cut off with no way to scroll to it. Every other table page already scrolls horizontally, but they all still push wide grids off-screen with no anchor, so you lose track of which row you're on.

Separately, the header filter dropdowns build their option list from the rows currently loaded. If nobody in the current date range is unanswered, "No" never appears in the Answered dropdown — the choice you want is missing.

## What changes

### 1. Nothing gets clipped
- Clients table gets proper horizontal scrolling (matching every other page) instead of hidden overflow.
- All data tables get a shared frame with: horizontal scroll, a sticky header row that stays visible while scrolling vertically, and soft fade edges that show more content exists to the left/right.

### 2. See everything without scrolling
Three complementary moves, so the wide tables mostly fit on one screen:
- **Fit-to-width mode** — a toggle in the table toolbar that shrinks font/padding and lets long text wrap so all visible columns compress into the viewport. Persisted per table, alongside the existing density setting.
- **Frozen identity columns** — the checkbox, expand and name columns stay pinned on the left while the rest scrolls, so a row never becomes anonymous.
- **Smarter default column sets** — on the widest tables (Clients, Leads, Revenue) the rarely used columns start hidden, so the default view fits. Everything is still one click away in the Columns menu, and hidden/shown choices stay remembered.

### 3. Header dropdowns list every option
- Column definitions can declare a fixed option list, so a dropdown always offers the full set of choices even when the current rows don't contain them.
- Applied to the boolean/enumerated columns: Answered (Yes / No), Qualified (Qualified / Pending), Origin (New lead / Legacy), FTD type, Status, Potential and Value tier.
- Options that aren't declared keep the current behaviour of being derived from the data (Source, agents, Country).

## Technical notes

- `src/components/table-toolbox.tsx`: add `options?: string[]` to `ColDef`, use it in `optionsFor`; add `fit` state (persisted in `localStorage` next to `table-cols:`/`table-filters:`) plus a small toggle control exported for the toolbar.
- New `src/components/table-frame.tsx`: wrapper div with `overflow-x-auto scroll-slim`, rounded border, scroll-shadow edges, and a `fit` prop that applies the compressed type scale and `whitespace-normal` via a data attribute.
- `src/styles.css`: rules for `[data-fit="1"] table` (smaller text, tighter padding, wrapping cells) and sticky-left column utilities used by the pinned columns.
- Replace the clipped wrapper at `src/routes/_authenticated/activations.tsx:747` with the new frame; swap the existing `overflow-x-auto scroll-slim` wrappers on the other list pages (leads, revenue, withdrawals, expenses, employees, sources, recurring, affiliates, tasks, performance, logs, activity) for the same frame.
- Add `options` and `defaultHidden` adjustments to the col defs on Clients, Leads and Revenue.
