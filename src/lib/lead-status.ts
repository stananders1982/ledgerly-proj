import type { Database } from "@/integrations/supabase/types";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];

export const LEAD_STATUSES: LeadStatus[] = [
  "call_back",
  "activated",
  "duplicate",
  "failed_deposit",
  "hot",
  "low_potential",
  "na1",
  "na2",
  "need_to_cancel",
  "never_registered",
  "new",
  "no_answer",
  "no_language",
  "no_money",
  "not_interested",
  "not_reachable",
  "reassign",
  "risk",
  "test",
  "transfer",
  "under_age",
  "voice_mail",
  "wrong_details",
  "wrong_number",
  "wrong_person",
  "interested",
  "contacted",
  "qualified",
  "lost",
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  call_back: "Call Back",
  activated: "Deposited",
  duplicate: "Duplicate",
  failed_deposit: "Failed Deposit",
  hot: "Hot",
  low_potential: "Low Potential",
  na1: "NA1",
  na2: "NA2",
  need_to_cancel: "Need to cancel",
  never_registered: "Never registered",
  new: "New",
  no_answer: "No Answer",
  no_language: "No Language",
  no_money: "No Money",
  not_interested: "Not Interested",
  not_reachable: "Not Reachable",
  reassign: "Reassign",
  risk: "Risk",
  test: "Test",
  transfer: "Transfer",
  under_age: "Under Age",
  voice_mail: "Voice Mail",
  wrong_details: "Wrong Details",
  wrong_number: "Wrong Number",
  wrong_person: "Wrong Person",
  interested: "Interested",
  contacted: "Contacted",
  qualified: "Qualified",
  lost: "Lost",
};

const GREEN = new Set<LeadStatus>(["call_back", "activated", "failed_deposit", "hot"]);
const YELLOW = new Set<LeadStatus>(["na1", "na2"]);
const ORANGE = new Set<LeadStatus>(["new", "reassign", "transfer", "voice_mail"]);
const PURPLE = new Set<LeadStatus>(["test"]);
const RED = new Set<LeadStatus>([
  "duplicate", "low_potential", "need_to_cancel", "never_registered", "no_answer",
  "no_language", "no_money", "not_interested", "not_reachable", "risk", "under_age",
  "wrong_details", "wrong_number", "wrong_person",
]);

export function leadStatusDotClass(status: LeadStatus) {
  if (GREEN.has(status)) return "bg-lead-status-green";
  if (YELLOW.has(status)) return "bg-lead-status-yellow";
  if (ORANGE.has(status)) return "bg-lead-status-orange";
  if (PURPLE.has(status)) return "bg-lead-status-purple";
  if (RED.has(status)) return "bg-lead-status-red";
  return "bg-lead-status-neutral";
}