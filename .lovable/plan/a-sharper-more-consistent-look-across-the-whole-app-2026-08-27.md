# A sharper, more consistent look across the whole app

One visual system applied everywhere: colours, typography, tables, cards and chrome. No feature or data logic changes.

## The direction I'm picking

- **Palette — refined emerald on cool slate.** Keeps the identity you already have, but with deeper, cleaner contrast: crisper surfaces, quieter borders, a proper separation between page background, cards and the sidebar. Money and status get dedicated colours (positive, negative, warning, neutral) instead of ad-hoc greens and reds, and both light and dark mode are tuned to the same contrast standard.
- **Typography — Sora for headings, Manrope for body, tabular figures for all numbers.** Numbers line up column to column so totals are scannable; headings get a distinct, modern voice instead of blending into the body text.
- **Tables — dense analyst grid with a comfort toggle.** Sticky headers, subtle row striping, hover highlight, right-aligned monetary columns with tabular digits, quieter column separators, clearer sort indicators, and consistent badge sizing. The existing density switch keeps working, and compact becomes genuinely compact.

## What changes, page by page

- **Every table** (clients, leads, revenue, withdrawals, expenses, employees, affiliates, tasks, reports, logs, activity): same header treatment, same row height scale, same alignment rules, same empty state, same skeleton loading, same pagination footer.
- **Stat / KPI cards**: unified size, label, value and delta treatment, with positive/negative deltas coloured from tokens.
- **Sidebar and top bar**: tighter spacing, clearer active state, better separation from content.
- **Dialogs, sheets, dropdowns, inputs**: consistent radius, border, elevation and focus ring.
- **Badges and status pills** (potential, tier, risk, FTD/STD, late, whale, affiliate alerts): one shared scale and colour mapping so the same meaning always looks the same.
- **Charts**: chart colours redefined from the new palette so dashboard and report graphs match the UI.

## Technical notes

- All colour, shadow, radius and typography values are defined as tokens in `src/styles.css` (`:root` and `.dark`), including new semantic tokens for money-positive / money-negative / surface levels. Components use tokens only — no hardcoded colour classes.
- Fonts loaded via a `<link>` in `src/routes/__root.tsx`, wired through `--font-display` / `--font-sans` in the `@theme inline` block; a `tabular-nums` utility is applied to numeric cells.
- Table styling is centralised in `src/components/sortable-table.tsx`, `table-skeleton.tsx`, `empty-state.tsx`, `pagination.tsx` and the shadcn `table` primitive, so every page inherits it without per-page edits.
- Shared surfaces updated: `stat-card.tsx`, `page-header.tsx`, `status-badge.tsx`, `client-profile-fields.tsx` badges, `app-sidebar.tsx`, `density-provider.tsx` spacing scale, and the shadcn `button` / `input` / `dialog` / `card` variants.
- Per-page work is limited to removing hardcoded colour utilities and stale spacing so the shared styles show through; no query, calculation or business-rule changes.
- Verified in both light and dark mode at desktop and mobile widths.
