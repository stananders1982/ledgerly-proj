/**
 * Deposit requests: a retention agent asks for bank details, an admin approves
 * (assigning a company bank + invoice number) and later confirms the money
 * landed — only then does it become real income.
 */

export const DEPOSIT_REQUEST_STATUSES = [
  "pending",
  "approved",
  "confirmed",
  "rejected",
  "cancelled",
] as const;

export type DepositRequestStatus = (typeof DEPOSIT_REQUEST_STATUSES)[number];

export const DEPOSIT_REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "Pending approval",
  approved: "Awaiting funds",
  confirmed: "Confirmed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const DEPOSIT_REQUEST_STATUS_TONE: Record<string, string> = {
  pending: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  approved: "border-sky-500/50 text-sky-600 dark:text-sky-400",
  confirmed: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  rejected: "border-destructive/50 text-destructive",
  cancelled: "border-muted-foreground/40 text-muted-foreground",
};

export type CompanyBank = {
  id: string;
  name: string;
  account_details: string | null;
  bsb: string | null;
  swift: string | null;
  currency: string;
  instructions: string | null;
  invoice_start: number;
  next_invoice_no: number;
  active: boolean;
};

export type DepositRequest = {
  id: string;
  company_id: string;
  activation_id: string | null;
  client_name: string;
  employee_id: string | null;
  requested_by: string;
  requested_by_email: string | null;
  request_date: string;
  amount: number | string;
  currency: string;
  client_bank: string | null;
  first_deposit: boolean;
  client_age: number | null;
  geo: string | null;
  client_address: string | null;
  client_bank_details: string | null;
  card_last4: string | null;
  method: string | null;
  note: string | null;
  status: string;
  reject_reason: string | null;
  bank_id: string | null;
  invoice_no: number | null;
  approved_at: string | null;
  confirmed_at: string | null;
  confirmed_amount: number | string | null;
  confirmed_date: string | null;
  revenue_id: string | null;
  created_at: string;
};

/** Agents may still edit/resubmit a request in these states. */
export const isEditableByRequester = (status: string) => status === "pending" || status === "rejected";

/** Awaiting an admin decision. */
export const isAwaitingApproval = (status: string) => status === "pending";
