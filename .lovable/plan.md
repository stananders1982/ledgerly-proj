# Ledgerly as a proper CRM

The app already has the financial brain (clients, deposits, balances, health scores, AI insight). What's missing is the *relationship-workflow* layer a real CRM gives agents every day. This plan adds five pieces, all built on the existing client records and tables.

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

## 3. Outreach from the app (no provider setup)

Message templates per channel (call script, WhatsApp, email) with variables like `{name}`, `{balance}`, `{agent}`, managed in Settings (admin). On the client page and worklist:

- **Call** → opens `tel:` and logs a call note box
- **WhatsApp** → opens `wa.me` with the template pre-filled, agent confirms → logged
- **Email** → opens `mailto:` with subject/body pre-filled, confirm → logged

Every send/confirm writes to the existing `client_communications` log, stamps "last touch", and feeds the Client 360 timeline — so nothing is typed twice.

## 4. Segments & bulk actions (on the Clients list)

- Saved segments on top of the existing filters: e.g. "Hot, no touch 3d", "Whales with open withdrawals", "Cold with balance > $1k". Saved per user, shareable company-wide by admins.
- Bulk actions on the selection: assign agent, set status, add tag, create task, set follow-up date — all company-scoped through the existing update path.

## 5. Follow-up cadences (automation, opt-in per status)

Simple rule sets: when a client enters a status, the system schedules touchpoints — e.g. Hot: call today, WhatsApp day 1, follow-up day 3; Warm: call day 1, follow-up day 7. Rules are editable in Settings (admin). Cadence steps appear as tasks/queue items in My Day; completing one arms the next. No external sending — everything stays manual-but-guided.

## Out of scope (deliberately)

- Real WhatsApp/email sending via providers — needs paid accounts and approval flows; click-to-open covers 90% of the value with zero setup. Can be added later via connectors if you want true sending.

## Technical notes

- No new "contacts" table: all of this hangs off the existing `daily_lead_activations` client record, `client_communications`, `tasks`, and Client 360 helpers, so RLS, permissions and audit logging behave exactly as today.
- New tables (migration, with GRANTs + RLS): `message_templates` (company_id, channel, name, body), `cadence_rules` (company_id, status, steps jsonb), `client_cadence_state` (client id, rule id, current step, next run date) — or store cadence state as a jsonb column on the activation if we keep rules minimal; decided at build time, leaning to the column.
- New columns on `daily_lead_activations`: `status_changed_at` (for stage-age on the pipeline), `last_touch_at` (stamped by every logged touchpoint).
- Routes: `src/routes/_authenticated/today.tsx`, `src/routes/_authenticated/pipeline.tsx`; nav entries added to `src/lib/nav-items.ts` with permission keys so admins can gate them per user like everything else.
- Kanban drag-and-drop reuses the dashboard's existing dnd setup; templates use simple `{var}` substitution — no new dependencies.
- Verification: `tsgo --noEmit`, plus a Playwright pass on `/today`, `/pipeline` drag, template send-and-log, and cadence task creation.
