# Client potential, done properly: financial KYC + AI opportunity score

Today "potential value" is a single number Jack types in, and whale is simply "that number is above the threshold". That stays — but on its own it can't answer the real question: *can we get more money out of this client, and how likely is it?* So we add the financial-KYC facts behind the number, and let the AI read those facts plus the comments and communication log to produce an opportunity score and a tier label.

## 1. Financial KYC block on every client

A new "Financial KYC" section on the client page (and in the client edit dialog):

- **Potential value ($)** — unchanged, still the headline number and still what drives the Whale threshold.
- **Estimated net worth ($)**
- **Liquid / investable funds ($)** — what they can actually move now.
- **Income ($ per month)**
- **Source of funds** — free text (salary, business, property sale, inheritance, crypto, pension…).
- **Deposit appetite** — 1-5 read on how ready they are to add funds.
- **Exposure elsewhere ($)** — roughly how much they already have with other brokers.

All optional. Anything Jack leaves empty is simply unknown to the AI — it will say so instead of guessing.

## 2. AI reads the comments and scores the opportunity

The existing "Analyse this client" already reads profile, comments, calls, deposits and withdrawals and returns a risk score. It gets extended, not replaced, so one click produces both sides of the story:

- **Opportunity score 0-100** — how much more money we can realistically take, and how soon. Driven by: KYC figures above, deposit history vs. stated potential, what the comments say about their financial situation and source of funds, appetite, and how recently we actually spoke to them.
- **Opportunity tier** — one of **Whale**, **Warm**, **Tapped out**, **At risk**, **Unknown**.
- **Suggested potential ($)** — the AI's own read of the potential from the comments and KYC, shown next to Jack's number so a stale number stands out. It never overwrites Jack's value; there's a one-click "use this" if he agrees.
- **Why** — two or three lines quoting the concrete facts and comment lines it used, plus the recommended next step.

Existing risk score / risk label stay exactly as they are — risk answers "are we losing them", opportunity answers "can we get more".

## 3. Value tiers — whale is just the top one

Potential value is split into named tiers instead of one whale/not-whale line. Each tier is a threshold in Settings, so you tune the bands per workspace:

| Tier | Default band (potential value) |
| --- | --- |
| **Whale** | 100,000+ |
| **High** | 50,000 - 99,999 |
| **Mid** | 15,000 - 49,999 |
| **Small** | 1 - 14,999 |
| **Unrated** | no potential value filled in |

Settings keeps the existing **Whale threshold** and gains **High**, **Mid** and **Small** thresholds next to it. Everything that says "whale" today (badges, filters, cards, AI) keeps working — whale is simply the top band.

Each client shows its tier badge, colour-coded, next to the potential number.

## 4. Filters

The Clients page potential filter becomes:

- **By tier** — Whale, High, Mid, Small, Unrated (also "Whale + High" as one option for the big-money list).
- **Neglected** — any tier, no deposit and no contact in the 14 days after activation. Combines with the tier choice, so "Neglected whales" is tier = Whale plus this toggle, and you can equally look at neglected High clients.
- **By opportunity tier** — Warm / Tapped out / At risk from the AI, so you can work "still has room" separately from "already gave us everything".
- **Above X** — free-number override (unchanged).

New sortable columns: **Tier**, **Opportunity** (score + badge) and **Liquid funds**. Potential $, Days since FTD and Last contact stay.


## 5. Where it shows up

- Client page: KYC block, value tier badge, opportunity score with tier badge and the AI's "why", plus the suggested-potential comparison.
- Clients list: tier + opportunity columns, badges, tier filters, and count cards per tier.
- Dashboard: the "Neglected whales" alert gains a companion count — whales and High clients with a high opportunity score that haven't been contacted in 14+ days.
- "Ask your data": each client's KYC figures, value tier, opportunity score and tier, so "how many High clients do we have?" and "who has liquid funds we haven't touched?" work.


## Technical notes

- Migration on `daily_lead_activations`: `net_worth`, `liquid_funds`, `monthly_income`, `exposure_elsewhere` (numeric, nullable), `source_of_funds` (text), `deposit_appetite` (smallint 1-5), plus AI columns `ai_opportunity_score` (int), `ai_opportunity_label` (text), `ai_opportunity_reason` (text), `ai_suggested_potential` (numeric). Existing company-scoped access rules cover them; index `ai_opportunity_score` for sorting.
- `src/lib/client-profile.ts`: extend `ClientProfile` with the KYC + opportunity fields and add an `opportunityTone()` helper next to `riskTone()`.
- `company_settings` gains `high_threshold`, `mid_threshold`, `small_threshold` (numeric, defaults 50000 / 15000 / 1) alongside the existing `whale_threshold`; `src/lib/settings.ts` + the Settings page expose them.
- `src/lib/whales.ts` gains `valueTier(potential, thresholds)` and the opportunity-tier derivation so list, cards, dashboard and AI snapshot share one function; the existing whale / neglected helpers stay and are re-expressed on top of `valueTier`.

- `src/lib/client-insight.functions.ts`: include the KYC fields in the `profile` payload, widen the strict JSON contract to also return `opportunity_score`, `opportunity_label`, `opportunity_reason`, `suggested_potential`, and persist them in the same update. Same `/v1/responses` call, one round trip.
- `src/components/client-profile-fields.tsx`: the Financial KYC inputs and the tier badge.
- `src/routes/_authenticated/activations.tsx`: opportunity/liquid columns and the tier filter options via the existing sortable-table + saved-views plumbing.
- `src/lib/ask.functions.ts`: add the KYC and opportunity fields to the per-client snapshot.
