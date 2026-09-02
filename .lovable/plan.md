# Leads-first pipeline and tighter role access

Leads become real records that people create by hand or receive from affiliates. Clients can no longer be created directly — every client starts as a lead and is converted.

## 1. A real Leads list

The Leads page gets two tabs:

- **Leads** (new, default): one row per person — name, phone, email, affiliate/source, status, conversion agent, created date, notes.
  - "Add lead" dialog to enter a lead by details (no deposit required).
  - Filters and search by name/phone/email, status, affiliate, agent; bulk assign an agent.
  - Row actions: edit, call/WhatsApp/email buttons, delete, and **Convert to client**.
  - Leads arriving from the affiliate intake API already land in the same place, so affiliate-sourced leads show up automatically.
- **Daily numbers** (the existing received / invalid / activated / reported / cost entry screen) stays untouched so source cost and ROI reporting keeps working.

## 2. Lead becomes a client

- **Convert to client** creates the client record (activation) with the workspace default opening balance, carrying over name, phone, email, affiliate/source, conversion agent and notes, and marks the lead converted. The lead row stays as history and links to the client.
- **Auto-convert on first deposit**: recording income for a name that matches an unconverted lead converts that lead automatically instead of leaving an orphan client.
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
