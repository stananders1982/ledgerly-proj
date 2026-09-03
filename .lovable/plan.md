# Merge "xx" duplicate rows during CSV import

## Rule
A row whose first name or last name ends with `xx` (e.g. `Johnxx Smith`, `John Smithxx`) is a duplicate of the same person without the `xx` (`John Smith`). The `xx` row must never create its own lead — instead its acquisition details are handed to the clean twin.

## Behaviour

1. **Detect** — before anything else, clean each row's name: strip a trailing `xx` (case-insensitive) from the first and/or last name to get the "clean name". Rows where a strip happened are marked as `xx` rows.
2. **Find the twin** — look for a lead with the clean name, first among the other rows of the same file, then among leads already in the system (same company, case/spacing-insensitive name match).
3. **Twin found** — skip the `xx` row entirely (no lead, no client, no income, no Daily Numbers count) and copy Source, Funnel Name, Affiliate Name and Affiliate Data from it onto the twin, **only where the twin has no value yet**. Existing values are never overwritten.
4. **No twin** — import the row normally but with the `xx` stripped from the name.
5. Everything else about the row (status, FTD, deposit logic) stays as it is today; only the name cleanup and the skip/donate behaviour change.

## Preview and reporting
- The preview table shows these rows as **Skip** with the reason "Duplicate of <clean name> — source/campaign copied", and the twin row shows which fields get filled.
- The import summary and Import history count them under skipped duplicates, so the totals still add up.

## Technical notes
- Name cleaning and the in-file pairing happen in the payload builder in `src/routes/_authenticated/import.tsx`, which sends each row a `clean_name` plus a flag/donor block (`source_id`, `affiliate_id`, funnel, affiliate data) instead of a plain name.
- Matching against existing leads and the fill-if-empty writes happen inside `import_old_crm_leads`, with the same logic mirrored in `preview_old_crm_leads` so the preview matches the real result. Funnel and Affiliate Data continue to live in the lead notes, so they are appended only when the twin's notes do not already mention them.
- Both functions are updated in one migration; no schema changes are required.
