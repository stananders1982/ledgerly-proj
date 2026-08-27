# Clients page: KPI cards that explain themselves and filter the table

Make the 8 KPI boxes on the Clients page self-explanatory and make every one of them an active control for the table below, not just a number.

## 1. Explanatory text under each value

Add a one-line description to every card using the existing `hint` slot on `StatCard`:

- **Clients** — "Clients matching your filters in this period."
- **Total balance** — "Deposits minus withdrawals across these clients."
- **Answered 99 / 104** — "Clients the retention agent has spoken to."
- **Whales** — "Potential above the whale threshold. Click to list them."
- **High value** / **Mid value** — "Potential in this tier. Click to list them."
- **Unrated** — "No potential set yet. Click to see who needs a rating."
- **Neglected clients** — "High-potential clients with no deposit in 14+ days. Click to act."

## 2. Every card clickable

Today only the tier cards are clickable (and it's invisible). Wire the rest:

- **Clients** → clears all filters (back to the full list).
- **Total balance** → sorts the table by balance, largest first (toggle asc/desc on repeat clicks).
- **Answered** → first click shows only *Not answered* (the actionable list); click again toggles to *Answered*; a third click returns to *All*. Cycles through the existing "All answers" filter.
- Tier cards (Whales / High / Mid / Unrated / Neglected) keep their current behaviour — clicking applies that filter; clicking the active card again clears it (toggle).

## 3. Visible click affordance

- Cards get a hover state (subtle border/ring highlight + pointer cursor) so it's obvious they're buttons.
- The card whose filter is currently active gets a highlighted ring and a small "Filtered" marker so you can see at a glance why the table is narrowed.
- Add a compact "Clear filters" chip that appears next to the filter bar whenever a card-driven filter is active.

## Technical notes

- All changes in `src/routes/_authenticated/activations.tsx`; `StatCard` already supports `hint` and `onClick`, so no component changes needed beyond styling tokens.
- Reuses the existing `tierFilter`, `answeredFilter` and sort state — no new filter logic, no data/query changes.
- Wrap the remaining bare `StatCard`s in the same button pattern the tier cards already use, with proper `aria-pressed` for accessibility.
