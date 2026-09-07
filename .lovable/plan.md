# Keep the $250 activation amount out of income

Four clients (David Arnold Wheildon, Richard Thompson, Steven Gill, Jagdeesh Sahay) show a $250 deposit on the Income page. That $250 is not a real deposit — it is the standard opening amount given to a lead when it is converted into a client (FTD). It should never be treated as income.

## Change

1. **Remove the four $250 income lines.** The amount moves onto the client's opening balance instead, so each client still shows $250 on their profile and still counts as an activated FTD. Income, profit and reports drop by $1,000 in total, which is correct.

2. **Stop creating them going forward.** When a converted/imported FTD comes in with only the standard $250 opening amount and no real deposit, the app records it as the client's opening balance and does not write an income line. A genuine deposit of any other amount, or a $250 deposit typed in by hand on the Income page, still counts as income as usual.

Nothing changes for FTD counts, commissions based on activations, or the daily numbers.

## Technical

- Data fix (run_sql): delete the 4 `revenue` rows with note `Imported from old CRM (FTD)` and amount 250; set the matching `daily_lead_activations.balance` to 250 for those activation ids.
- Migration: update `public.import_old_crm_leads(_rows jsonb, _skip_daily boolean)` (and the 1-arg wrapper if it duplicates the body) so the FTD branch reads the company's `company_settings.default_activation_balance`; when `ftd_amount` equals that value it inserts the activation with `balance = ftd_amount` and skips the `INSERT INTO public.revenue`. Any other positive amount keeps today's behaviour (activation balance 0 + revenue row). `ftd_count` still increments either way.
- Lead → client conversion in `src/components/leads-grid.tsx` already writes only the activation balance, no revenue row — no change needed.
- No UI changes.
