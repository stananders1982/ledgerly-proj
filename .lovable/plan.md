# Leads-first pipeline and tighter role access

Leads become real records that people create by hand or receive from affiliates. Clients can no longer be created directly — every client starts as a lead and is converted.

## 1. A real Leads list

The Leads page gets two tabs:

- **Leads** (new, default): one row per person in the **same dense grid layout as Clients**, with pinned identity/contact columns, a filter row beneath the headers, inline editing, row selection and familiar actions. Columns include name, contact actions, affiliate/source, conversion agent, status, created date and notes.
  - "Add lead" dialog to enter a lead by details (no deposit required).
  - Filters and search by name/phone/email, status, affiliate, agent; bulk assign an agent.
  - Inline editing for conversion agent and status; row actions for edit, call/WhatsApp/email, delete and **Convert to client**.
  - Leads arriving from the affiliate intake API already land in the same place, so affiliate-sourced leads show up automatically.
- **Daily numbers** keeps the existing affiliate workflow unchanged: enter received / invalid / activated / reported counts and cost, then when a deposit/activation happens add the person's name plus conversion and retention agents in the existing activated-lead rows. This remains available alongside the new individual Leads grid so source cost and ROI reporting keeps working.

## 2. Lead becomes a client

- **Convert to client** creates the client record (activation) with the workspace default opening balance, carrying over name, phone, email, affiliate/source, conversion agent and notes, and marks the lead converted. The lead row stays as history and links to the client.
- **Auto-convert on first deposit**: the existing daily affiliate entry flow remains valid — when the deposit/activation is entered with the person's name and agents, it creates the client and links or updates the matching individual lead. Recording income for a matching unconverted lead also converts it automatically instead of leaving an orphan client.
- Already-converted leads are hidden from the default list view (a "Converted" filter shows them).

## 3. No more creating clients directly

- The "Add client" button and the blank-record path on the Clients page are removed; the dialog stays for editing an existing client.
- Quick-create and any other "new client" shortcut point at "Add lead" instead.

## 4. Role access

- **Conversion agent** — sees Leads, Dashboard, Tasks, Performance. The Clients page is removed from their menu and their permission defaults.
- **Retention agent** — sees Clients (already scoped to clients allocated to them), Income, Withdrawals, Dashboard, Tasks, Performance. No Leads page.
- Both remain overridable per user in the permissions matrix.
- The Leads list is scoped for conversion agents to leads assigned to them (unassigned leads are visible so they can be picked up); managers and admins see everything.

## Technical notes

- Uses the existing `leads` table (name, phone, email, source_id, affiliate_id, employee_id, status, notes, activated). Its access rules are currently admin-only, so a migration adds company-member read/write policies plus the grants agents need, and an index on company + status.
- Conversion writes a `daily_lead_activations` row (conversion_employee_id, activation_date, default balance from company settings) and flips the lead's status to `activated`; a link column ties the lead to the created client so the timeline can show both.
- Auto-convert on deposit is handled where income is recorded, matching on trimmed lowercase name within the company.
- Role defaults change in `src/lib/permission-defaults.ts` (`AGENT_NAV` loses `activations`, gains nothing else; `RETENTION_NAV` unchanged).
