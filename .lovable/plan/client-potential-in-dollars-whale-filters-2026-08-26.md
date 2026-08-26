# Client potential in dollars + Whale filters

Give every client a numeric potential (how much money we realistically believe they can put in), then use it to spot whales and, more importantly, neglected whales.

## 1. Potential value field

- New field on every client: **Potential value ($)** — a free number Jack fills in (e.g. 100000).
- Sits next to the existing Low / Mid / High potential, which stays exactly as it is and keeps driving FTD qualification. Nothing about the money rules changes.
- Editable from: the client profile page, the client edit dialog, and the quick detail sheet.
- Shown on the Clients list as a sortable, filterable column, formatted as money, with a **Whale** badge when it is at or above the whale threshold.

## 2. Whale threshold setting

- New company setting: **Whale threshold** (default 100,000), in Settings next to the other thresholds.
- Used everywhere: badges, filters, and the AI so "how many whales do we have?" works.

## 3. Clients page filters

A new "Potential" filter with:

- **Whales** — potential value at or above the threshold.
- **Neglected whales** — whales that, in the 14 days following their FTD/activation date, have:
  - no deposit recorded, **and**
  - no contact logged (no call / WhatsApp / email / meeting in the communication log) in that same window.
  Both conditions must be true, so the list is "big client, we took nothing and we didn't even talk to them".
- **Above X** — a free-number override so you can look at any cut-off without changing the setting.

Two supporting columns so the list is actionable: **Days since FTD** and **Last contact**.

A "Neglected whales" count card appears on the Clients page alongside the existing cards and links straight into the filter.

## 4. Dashboard + AI

- A small "Neglected whales" alert on the dashboard when the count is above zero, linking to the filtered Clients list.
- "Ask your data" learns each client's potential value and whale/neglected status, so you can ask "which whales haven't deposited?" or "what's our total potential in the pipeline?".

## Technical notes

- Migration: `potential_value numeric` on `daily_lead_activations` (nullable, indexed for sorting), and `whale_threshold numeric not null default 100000` on `company_settings`. Existing company-scoped access rules cover both.
- Whale / neglected-whale logic lives in `src/lib/client-profile.ts` (or a new `whales.ts` helper) so the list page, dashboard card and AI snapshot all use one function: window = activation/qualified date + 14 days; deposits from `revenue`, contacts from `client_communications`.
- Clients page (`src/routes/_authenticated/activations.tsx`) gains the potential column, filter select, threshold input and count card via the existing sortable-table / saved-views plumbing; it will need the client-communications rows for the period to evaluate "contacted".
- Client page (`src/routes/_authenticated/clients.$id.tsx`) and `client-profile-fields.tsx` get the potential input plus the Whale badge.
- `src/lib/ask.functions.ts` client layer gains `potential_value`, `is_whale`, `neglected` and last-contact date.
