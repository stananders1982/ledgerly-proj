# Paste raw text, AI fills the client details

Instead of typing every field from the old CRM, you open a client page, paste whatever text you copied (a client card, an email, a chat log, a block of notes), and AI fills the client's details for you.

## How it works

1. On each client page there's a new **"Paste from old CRM"** button.
2. You paste the raw text — any shape, any language, no formatting rules.
3. AI reads it and proposes values for the client's fields.
4. You see a side-by-side review: **current value → suggested value**, per field, with a checkbox on each row. Fields the text doesn't mention are left out entirely.
5. Untick anything you disagree with, press Apply, and only the ticked fields are saved to the client.

Nothing is written until you press Apply, so a bad paste can never overwrite good data.

## Fields the AI fills

Contact: name, phone, email, country, city, language, gender, date of birth / age, occupation.

CRM: status (hot/warm/cold/dormant/churned), tags, notes, next follow-up date, preferred contact time.

Money profile: potential value, net worth, liquid funds, monthly income, exposure elsewhere, source of funds, deposit appetite.

Anything it can't determine is simply left blank rather than guessed. If the text mentions past deposits or withdrawals, they are shown as a note in the review ("text mentions a $5,000 deposit in March") rather than silently creating financial records — money entries stay manual.

## Bulk option (same mechanism)

The paste box also accepts text covering several clients at once. In that case the review step lists each detected person as a card, marked **New client** or **Matches [existing client]** (matched on phone, then email, then name). You tick which ones to create/update. This gives you the same speed as a file import without needing an export from the old CRM.

## Technical notes

- New server function `src/lib/client-import.functions.ts` using the existing Lovable AI setup, with `requireSupabaseAuth`, returning strict JSON via a tool/schema call: a list of extracted client objects plus per-field confidence and an `unmapped_notes` string.
- The model only returns data; all writes happen client-side after review, using the existing update path on `daily_lead_activations` (company-scoped) — so RLS and permissions behave exactly as they do in the manual form.
- New component `src/components/ai-client-paste.tsx`: the paste dialog, the field-diff review table, and the multi-client card list; mounted on `src/routes/_authenticated/clients.$id.tsx` (single-client mode) and on the clients list / `/import` page (bulk mode).
- Field definitions are reused from `src/lib/client-profile.ts` so the AI schema and the app stay in sync.
- Extraction is logged to the activity log as an edit, so you can see what came from a paste.
