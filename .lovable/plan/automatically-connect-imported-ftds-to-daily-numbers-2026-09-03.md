# Automatically connect imported FTDs to Daily numbers

## Goal
When an old-CRM CSV contains an FTD, import it as one connected record across Leads, Clients, Income, and Daily numbers—without double-counting totals that are already entered.

## Recommended behavior
- Use **FTD Time** as the activation/deposit date; fall back to Created Date when it is missing.
- Match the CSV source/affiliate to the existing source used by Daily numbers.
- Match **Assigned to** as the conversion agent. Use **FTD Owner** as the retention agent when present; otherwise fall back to the matched assigned agent so the required ownership is never blank.
- For each imported FTD, create and connect:
  - the individual Lead,
  - its Client/activation record,
  - the first-deposit Income record for the CSV FTD amount,
  - and the matching Daily numbers attribution row.
- If a Daily numbers row already has an unallocated FTD for that date/source, consume that slot and leave its totals unchanged.
- If no unallocated slot exists, create the date/source row when needed or increase its Activated/Converted total by one. This prevents the current totals from being counted twice.
- Preserve the CSV’s source, agent, amount, date/time, and old-CRM details in the linked records.

## Existing Richard Thompson correction
- Connect Richard Thompson’s existing client to the Amaze Daily numbers row dated September 3, 2026.
- Attribute that existing unallocated FTD to Oscar Loren and keep the Amaze total at 2 FTDs.
- Keep the existing linked $250 Income record rather than creating a duplicate.

## Reliability and feedback
- Move the multi-record FTD import into one authenticated, transactional backend operation so a partial failure cannot leave a lead without its client, deposit, or Daily numbers allocation.
- Make repeat uploads idempotent using the existing email/old-CRM identity checks and linked-record checks.
- Return an import summary showing leads imported, FTDs connected, Daily rows created/updated, and duplicates skipped.
- Refresh Leads, Clients, Income, Daily numbers, and allocation alerts after completion.

## Validation
- Test an FTD that fills an existing unallocated slot, an FTD requiring a new Daily row, a non-FTD lead, missing FTD Owner fallback, and a repeated CSV upload.
- Verify Richard no longer appears as an unallocated Amaze FTD and that Amaze remains at 2 FTDs for September 3.
