# Better affiliate detection on upload, and FTDs that land in the right Daily numbers row

## 1. Recognise affiliate names from the file

Today a file label only matches an affiliate when it is (almost) the same word, so names such as
`AmazeSec`, `Amaze Sec`, `Amaze-Media` or `KKLeads Ltd` can silently come in with no affiliate,
and the lead lands with a blank affiliate column.

Changes:

- Compare names ignoring spaces, dashes, punctuation and case.
- Also match when the file label *contains* the affiliate name (or vice versa) with a
  sensible minimum length, so `AmazeSec` → `Amaze` and `FlipsMedia Ltd` → `FlipsMedia`.
- Ignore common suffix noise (`sec`, `media`, `leads`, `ltd`, `llc`, `group`, `crg`, `flat`)
  when the shortened form still uniquely identifies one affiliate.
- Keep it safe: when a label could be two affiliates (e.g. `FTDhub` with both `FTDhub-FLAT`
  and `FTDhubCRG`), it stays unmatched rather than guessing.
- Use the same rule everywhere a file is read: the Leads importer, the Daily numbers importer
  and the affiliate/source lookup they share.

### Unmatched names are resolved in the preview

The preview step gains a short "Unrecognised partner names" list: each distinct name from the file
that could not be matched, with a dropdown of existing affiliates (plus an option to leave it blank).
Choices apply to every row using that name and are remembered for future uploads, so the same
spelling matches automatically next time.

## 2. Converting a lead to an FTD updates Daily numbers properly

Today converting only bumps the **Reported** count, only when "reported" is chosen, and only on a
row dated today — so the day the lead actually came in never shows the FTD.

New behaviour on conversion:

- Find the Daily numbers row for the **lead's received date** and its affiliate/source.
- Increase **Activated** and **Converted** by one on that row.
- Increase **Reported** by one as well when "reported to the affiliate" is chosen.
- If that date/affiliate has no row yet, create one with those counts.
- Un-converting or deleting the client reverses the same counts, so numbers can't drift.
- Refresh Daily numbers, Leads and Clients right after, so the change is visible immediately.

## Technical notes

- Shared matcher lives in one helper (used by `src/routes/_authenticated/import.tsx`,
  `src/lib/old-crm-lead-payload.ts`, `src/lib/old-crm-daily.ts`): normalise → exact → prefix →
  suffix-stripped → containment, each step requiring a unique hit.
- Remembered spellings are stored per company as affiliate aliases (small new table with
  company-scoped access rules), read by the importer before falling back to fuzzy matching.
- Conversion logic in `src/components/leads-grid.tsx` moves to one helper that resolves the daily
  row by `entry_date = lead.created_at::date` and `source_id = affiliate_id ?? source_id`
  (falling back to the plain source name), then increments `activated`, `converted` and optionally
  `reported`; the same helper decrements on reversal.
