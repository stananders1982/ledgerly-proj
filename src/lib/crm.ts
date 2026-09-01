/**
 * CRM workflow layer — message templates, follow-up cadences and the daily
 * agent worklist.
 *
 * Everything here is pure: it takes client rows (`daily_lead_activations`)
 * plus a clock and returns what an agent should do. No fetching, no writes.
 */

import { CLIENT_STATUSES, type ClientStatus } from "./client-profile";
import { NEGLECT_WINDOW_DAYS, potentialValue } from "./whales";

/* ------------------------------------------------------------ templates */

export const TEMPLATE_CHANNELS = ["call", "whatsapp", "email"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

export const TEMPLATE_CHANNEL_LABEL: Record<TemplateChannel, string> = {
  call: "Call script",
  whatsapp: "WhatsApp message",
  email: "Email",
};

export type MessageTemplate = {
  id: string;
  channel: string;
  name: string;
  subject: string | null;
  body: string;
  active: boolean;
};

/** Variables an author can drop into a template body. */
export const TEMPLATE_VARS = [
  { key: "name", hint: "Client's name" },
  { key: "first_name", hint: "First word of the client's name" },
  { key: "balance", hint: "Current balance, formatted" },
  { key: "agent", hint: "Your name" },
  { key: "company", hint: "Workspace name" },
  { key: "country", hint: "Client's country" },
  { key: "status", hint: "Pipeline status" },
] as const;

/** Replace `{var}` placeholders. Unknown variables are left untouched. */
export function renderTemplate(body: string, vars: Record<string, string | null | undefined>) {
  return String(body ?? "").replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = vars[key];
    return v == null || v === "" ? match : String(v);
  });
}

/* -------------------------------------------------------------- cadences */

export const CADENCE_ACTIONS = ["call", "whatsapp", "email", "task"] as const;
export type CadenceAction = (typeof CADENCE_ACTIONS)[number];

export type CadenceStep = {
  /** Days after entering the status. 0 = same day. */
  day: number;
  action: CadenceAction;
  note: string;
};

export type CadenceRule = {
  id?: string;
  status: string;
  active: boolean;
  steps: CadenceStep[];
};

/** Sensible starting sequences, offered when a company has none saved. */
export const DEFAULT_CADENCES: Record<ClientStatus, CadenceStep[]> = {
  hot: [
    { day: 0, action: "call", note: "First call — qualify and set expectations" },
    { day: 1, action: "whatsapp", note: "Recap the call and confirm next step" },
    { day: 3, action: "call", note: "Close or book a decision date" },
  ],
  warm: [
    { day: 1, action: "call", note: "Check interest and answer objections" },
    { day: 4, action: "whatsapp", note: "Share a relevant update" },
    { day: 7, action: "task", note: "Decide: push to hot or park as cold" },
  ],
  cold: [
    { day: 7, action: "email", note: "Low-pressure value email" },
    { day: 21, action: "call", note: "Re-qualify — has anything changed?" },
  ],
  dormant: [
    { day: 14, action: "whatsapp", note: "Reactivation message" },
    { day: 45, action: "call", note: "Last reactivation attempt" },
  ],
  churned: [],
};

export function cadenceFor(rules: CadenceRule[] | undefined, status?: string | null): CadenceStep[] {
  const s = String(status ?? "").toLowerCase();
  const saved = (rules ?? []).find((r) => r.status === s);
  if (saved) return saved.active ? saved.steps ?? [] : [];
  return (DEFAULT_CADENCES as Record<string, CadenceStep[]>)[s] ?? [];
}

const DAY_MS = 86_400_000;

const startOfDay = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00`).getTime();

const dayDiff = (iso: string | null | undefined, now: Date): number | null => {
  if (!iso) return null;
  const t = new Date(String(iso).length <= 10 ? `${String(iso)}T00:00:00` : String(iso)).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((startOfDay(now) - startOfDay(new Date(t))) / DAY_MS);
};

/**
 * The next cadence step still owed for a client, based on how long they have
 * been sitting in their current status and when they were last contacted.
 */
export function dueCadenceStep(
  client: { status?: string | null; status_changed_at?: string | null; last_touch_at?: string | null },
  rules: CadenceRule[] | undefined,
  now = new Date(),
): (CadenceStep & { overdueBy: number }) | null {
  const steps = cadenceFor(rules, client.status);
  if (!steps.length) return null;
  const inStage = dayDiff(client.status_changed_at, now);
  if (inStage == null) return null;
  const sinceTouch = dayDiff(client.last_touch_at, now);

  const due = [...steps]
    .sort((a, b) => a.day - b.day)
    .filter((s) => inStage >= s.day)
    // A step counts as handled once we made contact on or after its due day.
    .filter((s) => sinceTouch == null || sinceTouch > inStage - s.day);

  const next = due[due.length - 1];
  return next ? { ...next, overdueBy: inStage - next.day } : null;
}

/* ------------------------------------------------------------- worklist */

export const WORKLIST_BUCKETS = [
  "overdue",
  "today",
  "hot-unworked",
  "new-to-me",
  "neglected",
  "cadence",
] as const;
export type WorklistBucket = (typeof WORKLIST_BUCKETS)[number];

export const BUCKET_LABEL: Record<WorklistBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  "hot-unworked": "Unworked hot",
  "new-to-me": "New to me",
  neglected: "Neglected money",
  cadence: "Cadence due",
};

export const BUCKET_HINT: Record<WorklistBucket, string> = {
  overdue: "Follow-up date has passed and nobody has spoken to them since.",
  today: "Their follow-up falls today.",
  "hot-unworked": "Marked hot but no contact in the last 48 hours.",
  "new-to-me": "Assigned in the last 3 days and never contacted.",
  neglected: "Valuable clients past the neglect window with no deposit and no contact.",
  cadence: "The saved follow-up sequence says a touch is due.",
};

export const BUCKET_TONE: Record<WorklistBucket, string> = {
  overdue: "border-rose-500/50 text-rose-600 dark:text-rose-400",
  today: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  "hot-unworked": "border-rose-500/40 text-rose-600 dark:text-rose-400",
  "new-to-me": "border-sky-500/50 text-sky-600 dark:text-sky-400",
  neglected: "border-violet-500/50 text-violet-600 dark:text-violet-400",
  cadence: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
};

/** Order the queue is worked in. */
const BUCKET_RANK: Record<WorklistBucket, number> = {
  overdue: 0, today: 1, "hot-unworked": 2, cadence: 3, neglected: 4, "new-to-me": 5,
};

export type WorklistClient = {
  id: string;
  lead_name?: string | null;
  status?: string | null;
  status_changed_at?: string | null;
  last_touch_at?: string | null;
  next_follow_up?: string | null;
  employee_id?: string | null;
  conversion_employee_id?: string | null;
  potential_value?: unknown;
  qualified_at?: string | null;
  activation_date?: string | null;
  created_at?: string | null;
  phone?: string | null;
  email?: string | null;
  answered?: boolean | null;
};

export type WorklistItem<T extends WorklistClient = WorklistClient> = {
  client: T;
  bucket: WorklistBucket;
  reason: string;
  /** Days late — used for sorting inside a bucket. */
  lateBy: number;
  step: CadenceStep | null;
};

/**
 * Bucket every client into the one queue an agent works today.
 * A client appears once, under their most urgent reason.
 */
export function buildWorklist<T extends WorklistClient>(
  clients: T[],
  opts: {
    rules?: CadenceRule[];
    /** Deposit total per client id — a deposit counts as "worked". */
    depositTotal?: (c: T) => number;
    now?: Date;
  } = {},
): WorklistItem<T>[] {
  const now = opts.now ?? new Date();
  const out: WorklistItem<T>[] = [];

  for (const c of clients) {
    const sinceTouch = dayDiff(c.last_touch_at, now);
    const followUp = dayDiff(c.next_follow_up, now);
    let item: WorklistItem<T> | null = null;

    if (followUp != null && followUp > 0 && (sinceTouch == null || sinceTouch > followUp)) {
      item = { client: c, bucket: "overdue", reason: `Follow-up was ${followUp} day${followUp === 1 ? "" : "s"} ago`, lateBy: followUp, step: null };
    } else if (followUp === 0) {
      item = { client: c, bucket: "today", reason: "Follow-up scheduled for today", lateBy: 0, step: null };
    } else if (String(c.status ?? "").toLowerCase() === "hot" && (sinceTouch == null || sinceTouch >= 2)) {
      item = {
        client: c,
        bucket: "hot-unworked",
        reason: sinceTouch == null ? "Marked hot and never contacted" : `Marked hot, no contact for ${sinceTouch} days`,
        lateBy: sinceTouch ?? 99,
        step: null,
      };
    } else {
      const step = dueCadenceStep(c, opts.rules, now);
      if (step) {
        item = { client: c, bucket: "cadence", reason: step.note || `${step.action} due`, lateBy: step.overdueBy, step };
      } else {
        const ftdAge = dayDiff(c.qualified_at ?? c.activation_date, now);
        const deposits = opts.depositTotal ? opts.depositTotal(c) : 0;
        const worthIt = (potentialValue(c.potential_value) ?? 0) > 0;
        if (worthIt && ftdAge != null && ftdAge >= NEGLECT_WINDOW_DAYS && deposits <= 0 && sinceTouch == null) {
          item = { client: c, bucket: "neglected", reason: `No deposit and no contact ${ftdAge} days after activation`, lateBy: ftdAge, step: null };
        } else {
          const age = dayDiff(c.created_at, now);
          if (age != null && age <= 3 && sinceTouch == null) {
            item = { client: c, bucket: "new-to-me", reason: age === 0 ? "Assigned today, not contacted" : `Assigned ${age} days ago, not contacted`, lateBy: age, step: null };
          }
        }
      }
    }

    if (item) out.push(item);
  }

  return out.sort(
    (a, b) => BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] || b.lateBy - a.lateBy ||
      String(a.client.lead_name ?? "").localeCompare(String(b.client.lead_name ?? "")),
  );
}

/* -------------------------------------------------------------- segments */

export type SegmentKey =
  | "hot-no-touch"
  | "overdue-followup"
  | "whales-idle"
  | "unassigned"
  | "no-contact-details";

export const SEGMENTS: { key: SegmentKey; label: string; hint: string }[] = [
  { key: "hot-no-touch", label: "Hot, no touch 3d", hint: "Status hot with no logged contact in the last three days." },
  { key: "overdue-followup", label: "Overdue follow-up", hint: "Follow-up date has passed with no contact since." },
  { key: "whales-idle", label: "Idle whales", hint: "Top-tier potential with no contact for two weeks." },
  { key: "unassigned", label: "Unassigned", hint: "No retention agent on the record." },
  { key: "no-contact-details", label: "Missing phone/email", hint: "Nobody can actually reach this client." },
];

export function matchesSegment(c: WorklistClient, key: SegmentKey, now = new Date()): boolean {
  const sinceTouch = dayDiff(c.last_touch_at, now);
  const followUp = dayDiff(c.next_follow_up, now);
  switch (key) {
    case "hot-no-touch":
      return String(c.status ?? "").toLowerCase() === "hot" && (sinceTouch == null || sinceTouch >= 3);
    case "overdue-followup":
      return followUp != null && followUp > 0 && (sinceTouch == null || sinceTouch > followUp);
    case "whales-idle":
      return (potentialValue(c.potential_value) ?? 0) > 0 && (sinceTouch == null || sinceTouch >= 14);
    case "unassigned":
      return !c.employee_id;
    case "no-contact-details":
      return !String(c.phone ?? "").trim() && !String(c.email ?? "").trim();
    default:
      return true;
  }
}

/* ---------------------------------------------------------------- stages */

export const PIPELINE_STAGES = CLIENT_STATUSES;

/** Days a client has been sitting in their current status. */
export function stageAge(c: { status_changed_at?: string | null }, now = new Date()): number | null {
  return dayDiff(c.status_changed_at, now);
}
