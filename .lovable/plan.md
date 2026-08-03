## What's wrong with light mode today

Looking at the live screens, light mode is currently the dark theme's palette dropped onto a white page rather than a designed theme:

1. **Glow effects are hardcoded for dark.** The `glow-green` / `glow-red` / `glow-blue` / `glow-purple` / `glow-amber` utilities use fixed dark-mode colors and 55% opacity halos. On white, the KPI cards get fuzzy pink/green clouds bleeding into the page instead of crisp cards.
2. **Glass surfaces have invisible borders.** `glass-surface` borders use `white 8%`, which disappears on a light background — cards read as floating text blocks with no edge.
3. **Big numbers are washed out.** Hero KPI values ("$0", "-$110,499", "0.0%") use the dark-tuned chart/success/destructive hues, which are far too light on white. Several fail readable contrast.
4. **No surface hierarchy.** Page background (`0.985`), card (`1.0`), and sidebar (`0.97`) are nearly identical, and cards have no shadow — everything sits on one flat plane. In dark mode the depth comes from glow; light mode has no replacement.
5. **Sparklines and muted text** are too faint: chart strokes and `muted-foreground` were picked for a dark canvas.

## Proposed fix

**A. Theme-aware effect utilities (`src/styles.css`)**
- Rewrite the `glow-*` utilities so light mode gets a soft neutral elevation shadow plus a tinted 1px ring, instead of the wide colored halo. Dark mode keeps the current glow.
- Make `glass-surface` border and background theme-aware: on light, a real `--border` edge, higher card opacity, subtle top highlight.
- Tone down `aurora-bg` opacity in light mode so the hero area stays clean.

**B. Retune light tokens (`:root` in `src/styles.css`)**
- Darken the semantic accent colors for light mode so numbers are legible: `--primary`, `--success`, `--destructive`, `--warning`, and `--chart-1..5` each get a light-mode-specific lightness/chroma (roughly 0.45–0.55 L instead of 0.6–0.78).
- Lower `--muted-foreground` slightly for body-text contrast.
- Add real separation: cool-tinted page background, pure-white cards, slightly deeper sidebar, and a defined `--shadow-card` token used by card surfaces.

**C. Card + KPI polish**
- Apply the new elevation token to `card-surface` / KPI cards so they read as raised panels in light mode.
- Ensure badge and status-badge tints (CPA badge, savings green, delta chips) use the retuned tokens rather than the dark values.

**D. Verify**
- Re-capture Dashboard, Leads, Clients, Reports and Performance in both light and dark mode and compare, so the dark theme is unchanged and light mode is consistent across pages.

## Technical notes

All changes stay in `src/styles.css` (tokens + `@utility` blocks) plus any component that hardcodes a dark-mode value. No component logic, no data or backend changes. The `dark` variant already exists via `@custom-variant dark`, so effect utilities can branch with `:root:not(.dark)` / `.dark` selectors inside each `@utility` body — the same token names keep working everywhere they're already used, so no page-by-page rewrite is needed.
