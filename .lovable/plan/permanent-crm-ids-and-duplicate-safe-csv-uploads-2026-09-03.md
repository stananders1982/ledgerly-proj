# Permanent CRM IDs and duplicate-safe CSV uploads

## Goal
Give every lead and client a short, permanent CRM ID such as `LD-000123`, and make repeated or overlapping old-CRM CSV uploads safely skip records already in the system.

## Implementation

### 1. Add permanent CRM IDs
- Add a `crm_id` field to both leads and clients, with database-enforced uniqueness and non-empty values.
- Generate IDs automatically from one shared sequence, so manually created records, imported records, and clients created from deposits all receive an ID.
- When a lead becomes a client, carry the same CRM ID across both records rather than generating a second identity.
- Backfill every existing lead and client. Existing linked lead/client pairs will receive the same CRM ID; standalone records will each receive their own.
- Keep internal database UUIDs unchanged for routing and relationships.

### 2. Make repeat CSV uploads idempotent
- Keep the current checks for old CRM ID and normalized email.
- Add normalized phone matching as another duplicate signal.
- Store a deterministic import fingerprint for rows that lack old CRM ID, email, and phone, based on stable source fields from the original row. Re-uploading the same or an overlapping file will therefore skip the row instead of creating another lead, client, income entry, or Daily Numbers count.
- Enforce the stable import identifiers at database level to protect against concurrent uploads as well as normal repeat uploads.
- Preserve the selected behavior: matched records are skipped and never overwritten.

### 3. Show IDs and clear upload results
- Add the CRM ID as a visible, filterable column in both the Leads and Clients tables.
- Show the CRM ID on the client detail page and in the lead edit/view workflow where identity is useful.
- Keep the import summary explicit: imported, invalid, connected FTDs, and skipped duplicates.

### 4. Verify
- Test existing-record backfill and confirm all CRM IDs are unique, with linked lead/client pairs sharing one ID.
- Upload the same CSV twice and verify the second upload creates no duplicate leads, clients, income, or Daily Numbers increments.
- Test overlapping files and rows missing ID/email to confirm fallback matching works.
- Verify manual lead creation and automatic client creation both receive IDs, then check Leads and Clients rendering on desktop.

## Technical notes
- The current records already have unique internal UUIDs, but those are not staff-friendly CRM identifiers.
- The old-CRM importer currently skips by `old_crm_id` or normalized email. It does not currently protect rows where both are blank; this change adds phone/fingerprint fallback protection.
- “Clients” are stored as activation records rather than in a separate clients table, so CRM ID synchronization will cover both `leads` and `daily_lead_activations`.
