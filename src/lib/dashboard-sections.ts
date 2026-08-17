/**
 * Dashboard section visibility.
 *
 * Sections reuse the existing permission tables: they are stored as `nav_key`
 * values prefixed with `dash:`, so `effective_permission()`, `my_permissions()`
 * and the audit triggers all work unchanged.
 */
export const DASH_PREFIX = "dash:";

export type DashboardSectionKey =
  | "dash:alerts"
  | "dash:digest"
  | "dash:ask"
  | "dash:kpis"
  | "dash:engine"
  | "dash:revexp"
  | "dash:funnel"
  | "dash:sources"
  | "dash:insights"
  | "dash:cashflow"
  | "dash:quality"
  | "dash:activity"
  | "dash:retention"
  | "dash:conversion"
  | "dash:expenses"
  | "dash:goals"
  | "dash:goal_sources"
  | "dash:goal_employees";

export const DASHBOARD_SECTIONS: { key: DashboardSectionKey; label: string; hint: string }[] = [
  { key: "dash:alerts", label: "Alerts", hint: "Anomaly banners at the top of the dashboard." },
  { key: "dash:digest", label: "Daily digest", hint: "Today's summary card." },
  { key: "dash:ask", label: "Ask your data", hint: "AI question box." },
  { key: "dash:kpis", label: "Hero KPIs", hint: "Net profit, revenue, expenses, activation rate." },
  { key: "dash:engine", label: "Business engine", hint: "Acquisition, profitability and operations blocks." },
  { key: "dash:revexp", label: "Revenue vs expenses chart", hint: "Area chart over the selected period." },
  { key: "dash:funnel", label: "Lead funnel", hint: "Received → activated → reported." },
  { key: "dash:sources", label: "Lead source performance", hint: "Activated vs received per source." },
  { key: "dash:insights", label: "AI insights", hint: "Generated business insights." },
  { key: "dash:cashflow", label: "Cashflow forecast", hint: "90-day forecast card." },
  { key: "dash:quality", label: "Data quality", hint: "Data quality checks card." },
  { key: "dash:activity", label: "Activity feed", hint: "Recent workspace changes." },
  { key: "dash:retention", label: "Retention scoreboard", hint: "Deposits, withdrawals and net per retention agent." },
  { key: "dash:conversion", label: "Conversion scoreboard", hint: "FTDs, pending and total per conversion agent." },
  { key: "dash:goals", label: "Company goals", hint: "Monthly company revenue and activation targets." },
  { key: "dash:goal_sources", label: "Source goals", hint: "Per-source activation and deposit targets." },
  { key: "dash:goal_employees", label: "Employee goals", hint: "Per-employee FTD, STD, and revenue targets." },
  { key: "dash:expenses", label: "Expense breakdown", hint: "Where the money went." },
];


export const DASHBOARD_SECTION_KEYS = DASHBOARD_SECTIONS.map((s) => s.key) as string[];

export function isDashboardSectionKey(key: string | null | undefined) {
  return !!key && key.startsWith(DASH_PREFIX);
}

const AGENT_SECTIONS = [
  "dash:alerts",
  "dash:digest",
  "dash:kpis",
  "dash:engine",
  "dash:funnel",
  "dash:sources",
  "dash:activity",
];

const RETENTION_SECTIONS = [
  "dash:alerts",
  "dash:digest",
  "dash:kpis",
  "dash:engine",
  "dash:funnel",
  "dash:activity",
  "dash:quality",
];

export function defaultDashboardAllowed(roleKey: string, sectionKey: string) {
  if (roleKey === "admin" || roleKey === "manager") return true;
  if (roleKey === "agent") return AGENT_SECTIONS.includes(sectionKey);
  if (roleKey === "retention") return RETENTION_SECTIONS.includes(sectionKey);
  return false;
}
