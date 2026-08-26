# Smarter clients: profiles, comments and an AI that knows everything

Three things: a real client page, richer client info you can sort and filter by, and AI (both the dashboard "Ask your data" and a per-client read) that actually sees comments, calls, deposits and withdrawals.

## 1. Client profile fields

Add to each client record (the activation row):

- Personal: age (or date of birth), gender, country, city, language, phone, email, occupation
- Commercial: status (hot / warm / cold / dormant / churned), next follow-up date, preferred contact time
- Existing fields stay: potential, tags, notes, balance, answered, agents

On the Clients list these become sortable, filterable columns (age, country, status, follow-up date, balance, withdrawals), with a column picker so the table stays readable.

## 2. Dedicated client page

New page at `/clients/{id}`, opened from the client name in the list. The quick slide-over sheet stays for fast peeking and gets an "Open full profile" link.

Page layout:

- Header: name, status badge, potential, assigned conversion + retention agents, age/country
- Money row: current balance, total deposits, total withdrawals, net, FTD/STD state, days since last deposit
- Editable profile panel for all fields above
- Full transaction table (every deposit and withdrawal with running balance)
- Lifecycle timeline (lead received → activation → each deposit/withdrawal → each call/message)
- Communication log (existing calls/WhatsApp/email/meeting logging)
- Comments thread (existing comment component, with @mentions)
- AI insight panel (below)

## 3. AI client insight + risk score

On the client page, an "Analyse this client" button sends that client's profile, comments, communication log, deposits and withdrawals to the AI and returns:

- A short read of the client (behaviour, momentum, what the comments say)
- A recommended next action
- A risk/opportunity score (churn risk or upsell potential) with a one-line reason

The score is saved on the client so the Clients list shows a coloured badge and can be sorted by it — you can scan who needs attention. Re-running the analysis updates it.

## 4. "Ask your data" gets client-level knowledge

The dashboard assistant keeps all current aggregates and gains:

- A per-client layer: name, agents, activation and qualification date, status, potential, age/country, balance, deposit count and total, withdrawal total, last deposit date, last contact date, and the latest comments/communication summaries
- Withdrawals per client and per agent
- Expenses and recurring costs detail, tasks, attendance, goals — so profitability and workload questions work too
- Prompt rules so it can answer "what's going on with Noeline Leary?", "who hasn't deposited in 30 days?", "which clients are at risk?", "which clients did we pay out the most?"

To keep it fast and within limits, the client layer is capped to the most relevant clients (active in the selected period plus the largest balances), and the assistant is told when a list was truncated so it never invents numbers.

## Technical notes

- Migration: new columns on `daily_lead_activations` (age/dob, gender, country, city, language, phone, email, occupation, status, next_follow_up, preferred_contact_time, ai_risk_score, ai_risk_label, ai_summary, ai_analyzed_at). No new table needed; existing company-scoped access rules cover them.
- New route `src/routes/_authenticated/clients.$id.tsx`; reuse `ClientTimeline`, `ClientCommunications`, `CommentThread`, `AttachmentsPanel`. Balance math reuses the existing `netBalance` / `rules.ts` helpers so numbers match the Clients page exactly.
- New server function `src/lib/client-insight.functions.ts` (authenticated, Lovable AI Gateway) for the per-client analysis; writes the score back through the caller's client so access rules apply.
- `src/lib/ask.functions.ts` extended with the client layer and new prompt guidance; snapshot builders moved into a helper module to keep the server-function file thin.
- Clients list gets sortable/filterable columns for the new fields via the existing sortable-table and saved-views plumbing.
