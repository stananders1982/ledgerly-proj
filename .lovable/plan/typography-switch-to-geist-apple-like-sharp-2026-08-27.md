# Typography: Switch to Geist (Apple-like, sharp)

## Goal
Replace the current Sora/Manrope pairing with **Geist** — the closest free typeface to Apple's SF Pro — for a sharper, more precise feel across the entire app (tables, numbers, headings, UI chrome).

## Changes

### 1. Load Geist
- Install `@fontsource-variable/geist` (self-hosted, no Google Fonts round-trip, loads faster and works offline).
- Remove the Sora/Manrope `<link>` tags from `src/routes/__root.tsx`.

### 2. Update font tokens (`src/styles.css`)
- `--font-display: "Geist Variable", ui-sans-serif, system-ui, sans-serif`
- `--font-sans: "Geist Variable", ui-sans-serif, system-ui, sans-serif`
- Import the font CSS at the top of `src/styles.css` with the other `@import` rules.

### 3. Fine-tune for the sharper face
- Headings: tighten tracking slightly (Geist looks best with a touch of negative letter-spacing on large sizes).
- Numeric/table styles: keep tabular figures (Geist has excellent tabular numerals for the money columns).
- Small optical tweaks: slightly increase base font weight contrast (500 for UI labels, 600/700 for headings).

## Notes
- One font family for both display and body keeps the UI cohesive — this is the Apple approach.
- Colors, table styles, and the rest of the recent visual overhaul stay unchanged; only the type changes.
