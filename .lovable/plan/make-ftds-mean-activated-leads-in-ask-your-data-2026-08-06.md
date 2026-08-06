# Make "FTDs" mean activated leads in Ask your data

Today the Ask box answers an FTD question with both clocks and leads with the qualification number, which includes FTDs carried over from earlier months. That backlog isn't what you're asking about.

## Change

When a question says "FTDs" (or activations, conversions, deposits count) without mentioning commission or qualification:

- Answer with the activation clock only: leads activated in that period.
- Do not report the qualification number or the earlier-months backlog in that answer.
- Example for the screenshot: "In August 2026 you did 29 FTDs."

Qualified numbers still appear, but only when the question is about commission, payouts, valid/qualified FTDs, or explicitly asks for both. In that case the answer names the clock ("29 activated in August; 68 qualified for commission in August, 42 of them from earlier months").

Also add a same-month figure so a commission answer can say how many of the month's activations already qualified, instead of only the mixed total.

## Technical

`src/lib/ask.functions.ts`:
- Add `qualifiedSameMonthByMonthAndAgent` (qualified_at month equals activation month) to the snapshot.
- Rewrite the system prompt rules: default FTD/activation questions to `activationsByMonthActivatedAndAgent`; use `qualifiedFtdsByMonthQualifiedAndAgent` and `qualifiedFromEarlierMonthsByMonthAndAgent` only for commission/qualification questions; never volunteer the backlog otherwise.
- Keep "who is leading" ranked by qualified FTDs only when the question is about commission/pay; otherwise rank by activations.

No schema or UI changes.
