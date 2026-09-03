# Add the old CRM lead statuses and colors

## Goal
Make the Leads status controls match the supplied CRM reference, including each status name and its green, red, yellow, orange, or purple indicator.

## Changes
- Extend the database lead-status values with: Deposited, Duplicate, Failed Deposit, Hot, Low Potential, NA1, NA2, Need to cancel, Never registered, No Language, No Money, Not Reachable, Reassign, Risk, Test, Transfer, Under Age, Wrong Details, and Wrong Person.
- Keep existing statuses needed by current records and workflows; treat the existing FTD/activated state as Deposited in the interface so conversion behavior remains intact.
- Centralize lead status labels and color groups, then use them in the Leads table status dropdown, filters, add/edit flow, and old-CRM CSV mapping.
- Display a compact semantic color marker beside every status, matching the screenshots:
  - Green: Call Back, Deposited, Failed Deposit, Hot
  - Yellow: NA1, NA2
  - Orange: New, Reassign, Transfer, Voice Mail
  - Purple: Test
  - Red: Duplicate, Low Potential, Need to cancel, Never registered, No Answer, No Language, No Money, Not Interested, Not Reachable, Risk, Under Age, Wrong Details, Wrong Number, Wrong Person
- Verify existing records still render, status updates save, and the CSV importer recognizes these labels.
