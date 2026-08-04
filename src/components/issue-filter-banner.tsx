/**
 * Banner shown when a page is filtered down to the records behind a
 * data-quality check (deep-linked from the Data Quality page/card).
 */
import { AlertTriangle, X } from "lucide-react";

export const ISSUE_LABELS: Record<string, string> = {
  "leads-no-source": "Lead entries with no source",
  "revenue-no-method": "Income with no payment method",
  "revenue-no-agent": "Income with no agent",
  "clients-no-name": "Activations with no client name",
  "clients-no-potential": "Clients with no potential set",
  "clients-duplicate": "Duplicate client names",
  "clients-no-revenue": "Clients with no deposit recorded",
  "employees-no-team": "Employees with no team",
  "employees-no-salary": "Employees with no salary",
};

export function IssueFilterBanner({
  issue,
  count,
  onClear,
}: {
  issue: string;
  count: number;
  onClear: () => void;
}) {
  const label = ISSUE_LABELS[issue] ?? "Data quality issue";
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1 text-sm">
        Showing <span className="font-semibold tabular-nums">{count}</span> record
        {count === 1 ? "" : "s"} — {label}. All dates included.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-accent/40"
      >
        <X className="h-3 w-3" /> Clear filter
      </button>
    </div>
  );
}
