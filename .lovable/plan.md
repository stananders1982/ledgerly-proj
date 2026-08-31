# Clients List: Current Date & Neglect Window

## Goal
Make the Clients list explicitly show today's date, and ensure the "Neglected" flag only appears once the full 14-day post-FTD window has elapsed.

## Changes

1. **Current date on Clients list**
   - Add a visible "Today" date pill/chip next to the page title in `src/routes/_authenticated/activations.tsx`.
   - Use the existing `fmtDate` helper and `todayISO()` / `new Date()` so it matches the app's date formatting.

2. **Neglect window enforcement**
   - Confirm `src/lib/whales.ts::isNeglected` already returns `false` until `new Date() > neglectWindowEnd(startDate)`.
   - Update the "Neglected clients" KPI card hint to clearly say it only counts clients whose 14-day window has fully passed (e.g., "No deposit and no contact for the full 14 days after FTD. Only counted once the window has passed.").

## Verification
- Typecheck passes.
- Preview shows today's date on the Clients page.
- A client activated today or yesterday is not counted in the "Neglected clients" KPI.
