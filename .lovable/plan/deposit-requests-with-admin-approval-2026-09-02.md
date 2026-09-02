# Deposit requests with admin approval

Retention agents raise a deposit request; admins approve it, assign a company bank and an invoice number; when the money lands, an admin confirms it and the deposit becomes real income with commission and fees.

## The flow

```text
Agent fills form  ->  Pending approval  ->  Approved (bank + invoice no.)  ->  Confirmed (money booked)
                            |                        |
                         Rejected (reason)      Rejected / cancelled
```

## 1. Request form (agent)

New page **Deposit Requests** in the sidebar. "New request" opens a form:

- Client — picked from existing clients only (the agent's own clients if they are scoped). Age, GEO/country, phone and "First deposit yes/no" pre-fill from the client record and stay editable.
- Agent — the logged-in agent by default; admins/managers can pick another.
- Date, Amount + currency (same amount/currency control used elsewhere).
- Client bank name.
- Client full address.
- Client bank details (free text: IBAN / account / SWIFT).
- Last 4 digits of credit card.
- Optional note to the admin.

Submitting creates the request with status **Pending approval** and notifies admins (bell + Deposit Requests badge count).

## 2. Approval (admin)

Admins see pending requests in a queue with the full request card. They can:

- **Approve** — pick a company bank from a dropdown. The system assigns the next invoice number for that bank automatically (each bank has its own counter starting at 600, +1 per transaction). Status becomes **Approved / awaiting funds**, and the agent sees the assigned bank's payment details and invoice number so they can pass them to the client.
- **Reject** — with a reason. The agent can edit the request and resubmit, which puts it back in the queue.

## 3. Confirmation (admin)

When the money arrives, the admin marks the request **Confirmed**, entering the actual received date and (optionally) correcting the amount. On confirm the system creates the income entry, so:

- the deposit is attached to the client and lifts their balance,
- it counts in company income and reports,
- processing fees are applied from the existing method-fee settings, and
- the agent's commission is calculated on it exactly like any other deposit.

A confirmed request links to the income row it created; the income row links back to the request. Reversing a confirmation is admin-only and removes the income entry again.

## 4. Company banks in Settings

New **Banks** section in Settings (admin only): bank name, account/IBAN, SWIFT, currency, payment instructions shown to agents, invoice starting number (default 600), next invoice number, active toggle. Adding, editing and deactivating banks lives here.

## 5. Access

- Retention agents / agents: see and create their own requests, see the bank details assigned to their approved requests, edit and resubmit rejected ones. They cannot approve or confirm.
- Admins (and managers if you allow the action): see all requests, approve, reject, confirm, reverse.
- Client bank details and card digits are visible only to admins and the agent who submitted the request.

## Technical notes

- New tables: `company_banks` (name, account details, swift, currency, instructions, `invoice_start` default 600, `next_invoice_no`, active) and `deposit_requests` (client `activation_id`, `employee_id`, requested_by, date, amount, currency, client bank name, first deposit flag, client age, geo, address, bank details, card last4, note, status, reject reason, approved bank/`invoice_no`, approved_by/at, confirmed_by/at, `revenue_id`). Both with company scoping, GRANTs, RLS, `updated_at` triggers and audit-log triggers.
- RLS: admins full access via `has_role`/`can_do`; agents restricted to rows where they are the requester. Bank-detail columns are protected by the same row policy — no separate masked view.
- Invoice numbering runs inside the approval server function with `SELECT ... FOR UPDATE` on the bank row, so two simultaneous approvals never share a number.
- Approval and confirmation are `createServerFn` calls with `requireSupabaseAuth`; the confirm handler re-checks the admin role, inserts into `revenue` (with `activation_id`, `employee_id`, `method`, `fee_pct`/`fee_amount` from `methodFeePct`) and stores the resulting `revenue_id` on the request. Existing revenue triggers then handle FTD qualification, notifications and commission inputs unchanged.
- New nav key `deposit-requests` plus action keys `approve_deposits` / `confirm_deposits` wired into `nav-items.ts` and `permission-defaults.ts` (retention + agent get the page, admin/manager get the actions).
- Currency stored on the request; conversion to the display currency uses the existing `toBase`/`toDisplay` FX helpers.
