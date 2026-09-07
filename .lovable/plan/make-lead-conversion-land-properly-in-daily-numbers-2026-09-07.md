# Make lead conversion land properly in Daily numbers

## What I checked

- The upload flow (file → preview → import), including duplicate skipping, "xx" duplicate merging, partner-name matching and the daily totals it writes.
- The conversion flow (lead → FTD with a retention agent) and how Daily numbers reads its rows.
- Live data: 11 clients currently exist with no link to any Daily numbers day; today no day row disagrees with the clients listed under it.

## Problems found

1. **A converted lead is not attached to its day.** Converting adds +1 to Activated/Converted on the lead's received day, but the client record itself is created without a link to that day. Result: the day shows an extra FTD with nobody under it, the client never appears in the day's agent breakdown, and the "FTDs not allocated" warning grows even though the FTD is perfectly assigned.
2. **Possible double counting.** If that day already has an FTD counted from the upload (the file's FTD column) but nobody attached to it yet, converting the lead adds another one instead of filling the empty slot — so one deposit is counted twice.
3. **Nothing is reversed.** Deleting a lead, deleting the client, or undoing a conversion leaves the +1 on the day's totals forever.
4. **The retention agent is stored on the client but not visible on that day** until the link in (1) exists — the day's per-agent FTD split ignores it.

## The fix

### Converting a lead to an FTD
One shared routine handles the whole conversion:

- Find the Daily numbers row for the day the lead came in and its partner (affiliate, or source name when there is no matched partner). Create that row only if it genuinely doesn't exist.
- If that row already has an FTD counted with nobody attached, **use that empty slot** — attach the new client to it and leave the totals unchanged.
- Otherwise raise Activated and Converted by one.
- Raise Reported by one only when "reported to the affiliate" is chosen.
- Always attach the new client to that day's row, with the chosen retention agent and the converting agent, so it shows in the day's agent breakdown and stops counting as unallocated.
- Keep the deposit date as the day of conversion; only the acquisition day drives the Daily numbers row.

### Undoing
- Deleting a client that came from a conversion, or removing a lead's FTD, lowers Activated/Converted (and Reported when it had been reported) on the same day's row, never below zero.

### Upload side
- Apply the same "fill the empty slot first" rule the upload already uses, so uploads and manual conversions never disagree.
- Keep the existing protections: repeated files skip rows already imported, and the day's totals are not inflated by re-uploading.

### Clean-up of what already happened
- Attach the 11 existing clients that have no day to the correct day and partner where one can be determined, and correct that day's totals so the numbers and the named clients agree. Anything that cannot be matched is listed for you instead of guessed.

## Verification
- Convert a lead whose day already has an unfilled FTD → totals unchanged, client shows under that day and agent.
- Convert a lead whose day has no FTD yet → Activated and Converted go up by one on the received day.
- Convert with "reported = yes" → Reported also goes up on that same day.
- Convert a lead whose day has no row at all → the row is created with the right partner.
- Delete the client → the counts go back down.
- Re-upload the same file → no change to totals.
- Confirm the "FTDs not allocated" warning is empty afterwards.

## Technical notes
- Extend `src/lib/daily-ftd.ts` into the single entry point: resolve/create the day row, read `sum(activated_count)` of its `daily_lead_activations`, decide slot-consume vs increment, then insert the activation with `entry_id`, `employee_id` (retention), `conversion_employee_id` and `activated_count = 1`.
- `src/components/leads-grid.tsx` calls it instead of doing its own insert plus counter update; the client-delete path in `src/routes/_authenticated/activations.tsx` and `clients.$id.tsx` calls the reverse.
- Row resolution: `entry_date = leads.created_at::date`, matched on `source_id`, falling back to the plain `source` text (case-insensitive), mirroring `import_old_crm_leads`.
- Back-fill of the 11 orphan activations runs as a one-off data update after the code change, then re-checked with the entry-vs-allocated comparison query.
