# Ledgerly as a proper CRM

The app already has the financial brain (clients, deposits, balances, health scores, AI insight). What's missing is the *relationship-workflow* layer a real CRM gives agents every day. This plan adds seven pieces, all built on the existing client records and tables.

## 1. "My Day" — the agent worklist (new page `/today`)

The page an agent opens every morning. One queue, sorted for them:

- **Overdue** — follow-up date passed, still untouched
- **Due today** — today's follow-ups and tasks
- **Unworked hot** — status "hot" with no touchpoint in 48h
- **New to me** — clients assigned in the last 72h, never contacted
- **Neglected money** — whales/high-value clients past the neglect window

Each row: client name, value tier, balance, last touch, and one-click actions (call / WhatsApp / email / done / snooze). Clearing an item logs a touchpoint and removes it from the queue. Non-admins see only their own clients; admins can switch agents.

## 2. Pipeline board (new page `/pipeline`)

Kanban view of the existing client statuses — **Hot → Warm → Cold → Dormant → Churned** — as columns with drag-and-drop. Each card shows name, tier badge, balance, days in current stage, and a red "overdue follow-up" marker. Dragging between columns updates the status, logs the change in the Client 360 timeline, and shows a per-stage counter with total balance at the top of each column. Filters: agent, value tier, source.

## 3. Outreach from the app

Message templates per channel (call script, WhatsApp, email) with variables like `{name}`, `{balance}`, `{agent}`, managed in Settings (admin). On the client page and worklist:

- **Call** → real click-to-call, see §6
- **WhatsApp** → opens `wa.me` with the template pre-filled, agent confirms → logged
- **Email** → opens `mailto:` with subject/body pre-filled, confirm → logged

Every send/confirm writes to the existing `client_communications` log, stamps "last touch", and feeds the Client 360 timeline — so nothing is typed twice.

## 4. Segments & bulk actions (on the Clients list)

- Saved segments on top of the existing filters: e.g. "Hot, no touch 3d", "Whales with open withdrawals", "Cold with balance > $1k". Saved per user, shareable company-wide by admins.
- Bulk actions on the selection: assign agent, set status, add tag, create task, set follow-up date — all company-scoped through the existing update path.

## 5. Follow-up cadences (automation, opt-in per status)

Simple rule sets: when a client enters a status, the system schedules touchpoints — e.g. Hot: call today, WhatsApp day 1, follow-up day 3; Warm: call day 1, follow-up day 7. Rules are editable in Settings (admin). Cadence steps appear as tasks/queue items in My Day; completing one arms the next. No external sending — everything stays manual-but-guided.

## 6. Click-to-call with VoIP (Twilio connector)

Real in-browser calling instead of `tel:` hand-offs:

- **Connect Twilio** via the built-in connector (your own Twilio account + number; usage billed by Twilio, not Lovable). Recommended Twilio-side protections get called out during setup: SMS Pumping Protection and Geo Permissions limited to the countries you actually call.
- **Click any client phone number** → an in-app dialer opens: the browser rings the client through your Twilio number (agent's real number stays hidden), with mute/hang-up and a call-notes box.
- **Every call auto-logs** to `client_communications` (direction, duration, agent, notes) and the Client 360 timeline — no manual logging after a call.
- **Missed/failed calls** create a follow-up task automatically.
- Twilio voice webhooks land under `/api/public/twilio/*` (signature-verified) so call status/duration come back to the app; call recordings are off by default and can be toggled per company later.

If you'd rather start cheaper, step one ships the dialer UI with `tel:` fallback and Twilio plugs in the moment you connect it — the UI doesn't change.

## 7. Affiliate lead intake by API

Affiliates push leads straight into Ledgerly instead of emailing spreadsheets:

- **Per-affiliate API keys** — the existing API-key system gains an `affiliate` scope: a key is tied to one affiliate and can only create leads for them. Keys are issued/revoked from the affiliate page.
- **Lead intake endpoint** — `POST /api/public/v1/leads` extended (it already exists for general intake): accepts name + phone (+ email, country, notes, sub-id), stamps the lead with the key's affiliate, runs the existing duplicate phone/email guard, and returns a lead id the affiliate can use to check status later.
- **Status check endpoint** — `GET /api/public/v1/leads/{id}` returns a deliberately minimal status (received / activated / converted) — never balances or money data — so affiliates can poll their funnel.
- **Docs page** — the existing `/api-docs` page gets a ready-to-paste snippet per affiliate (curl + example payload) so you can hand any affiliate their key and instructions in one message.
- Incoming API leads flow into the normal pipeline: they appear in Leads, count toward affiliate CPA/guarantee math, and can be activated exactly like manually entered leads.

## Out of scope (deliberately)

- Real WhatsApp/email *sending* via providers — needs paid accounts and approval flows; click-to-open covers most of the value with zero setup. Can be added later via connectors.
- Inbound call routing / IVR — click-to-call is outbound agent→client.

## Technical notes

- No new "contacts" table: everything hangs off the existing `daily_lead_activations` client record, `client_communications`, `tasks`, and Client 360 helpers, so RLS, permissions and audit logging behave exactly as today.
- New tables (migration, with GRANTs + RLS): `message_templates` (company_id, channel, name, body), `cadence_rules` (company_id, status, steps jsonb), and cadence state kept as a jsonb column on the activation.
- New columns on `daily_lead_activations`: `status_changed_at` (pipeline stage age), `last_touch_at` (stamped by every logged touchpoint).
- `api_keys` gains an `affiliate_id` column + `leads:write` / `leads:read` permission values; the public lead routes verify the key hash server-side, enforce the affiliate binding, rate-check duplicates via the existing unique-phone trigger, and never trust client input (Zod validation).
- Twilio calls: server function creates the call through the connector gateway (`/Calls.json`); webhooks under `src/routes/api/public/twilio/` verify `X-Twilio-Signature` (HMAC, timing-safe) before writing call outcomes. Twilio secrets come from the connector — nothing hardcoded.
- Routes: `src/routes/_authenticated/today.tsx`, `src/routes/_authenticated/pipeline.tsx`; nav entries in `src/lib/nav-items.ts` with permission keys.
- Kanban drag-and-drop reuses the dashboard's existing dnd setup; templates use simple `{var}` substitution — no new dependencies.
- Verification: `tsgo --noEmit`, plus a Playwright pass on `/today`, `/pipeline` drag, template send-and-log, cadence task creation, API lead intake (curl with a test key), and the dialer UI (call placement tested once Twilio is connected).
