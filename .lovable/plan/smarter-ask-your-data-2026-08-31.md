# Smarter "Ask your data"

Today the assistant gets a snapshot of raw monthly buckets, per-agent totals and a client list, but no ready-made rates or sales summary — so questions like "what percentage of clients deposited?" force it to eyeball a 250-client list, and "summarize sales" has no single place to look. Two additions fix that, plus a set of upgrades to make the box feel like a real analyst.

## 1. Deposit percentages (rates block)

Add a `rates` section to the snapshot, computed server-side so the numbers are exact and never hallucinated:

- Clients who deposited at least once / total clients (count + %)
- Clients with 2+ deposits (STD rate) and 3+ deposits (repeat rate)
- Answered rate, qualified-FTD rate, neglected rate
- Deposit rate broken down by value tier (Whale / High / Mid / Small / Unrated), by country, by conversion agent and by retention agent
- Average and median deposit per depositing client, average deposits per client
- Withdrawal rate (clients who withdrew) and net-per-client
- Same rates for the selected dashboard period, not just the 6-month window

## 2. Sales summary block

Add a `salesSummary` section that pre-computes what a manager would put in a weekly recap:

- Period totals: deposits, deposit count, unique depositing clients, average ticket, largest single deposit
- New vs returning money: FTD (activation) deposits vs STD and later deposits
- Change vs the previous equivalent period (amount and %), plus the best and worst month in the window
- Top 5 agents, top 5 sources/affiliates, top 5 clients by deposits for the period
- Split by payment method, and by currency of origin
- Net picture: deposits − withdrawals − expenses for the period

The system prompt gains short rules telling the model to use `rates` and `salesSummary` verbatim for percentage and summary questions rather than recomputing from the client list, and to always state the denominator ("62 of 210 clients = 29.5%").

## Further improvements suggested

1. **Answer format for summaries** — allow a longer, bulleted answer when the question asks to "summarize" or "report", while keeping short answers for one-number questions.
2. **Show the maths** — return the key figures used (a small table of numbers under the answer) so the answer is auditable, not just prose.
3. **Follow-up questions** — keep the last few Q&A turns in the request so "and last month?" works.
4. **Suggested next questions** — after each answer, offer two or three clickable follow-ups relevant to what was just asked.
5. **Better starter prompts** — replace the four static suggestions with ones covering the new powers ("What % of clients deposited this month?", "Summarize sales for this period", "Which tier converts best?").
6. **Copy / save answer** — copy button, and optionally pin an answer to the dashboard.
7. **Drill-through** — when an answer names clients or agents, link them to their pages.
8. **Deterministic guardrail** — if the question is a pure count/percentage the snapshot already holds, answer straight from the snapshot value so it is never off by rounding.

## Technical notes

- All new aggregation lands in `src/lib/ask.functions.ts` before the snapshot object; helper maths (deposit counts per client) already exists there and is reused.
- Rate/summary helpers go into a small `src/lib/ask-stats.ts` so they can be unit-tested (`src/lib/__tests__`), keeping the server function a thin wrapper.
- Amounts are converted to the workspace base currency using the existing `toBase`/`sumBase` helpers so mixed-currency deposits summarize correctly.
- UI changes (suggestions, copy, follow-ups, figures table) live in `src/components/ask-box.tsx`.
