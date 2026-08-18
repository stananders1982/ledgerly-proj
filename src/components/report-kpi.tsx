import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Compact KPI tile for the Report Center overview.
 * Shows a value, an optional comparison against the previous period and a hint.
 */
export function ReportKpi({
  label,
  value,
  prev,
  current,
  invert,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  /** Raw numbers used only to compute the % delta. */
  prev?: number;
  current?: number;
  /** When true, a rising number is bad (costs). */
  invert?: boolean;
  hint?: ReactNode;
  emphasis?: boolean;
}) {
  const hasDelta = prev !== undefined && current !== undefined && Number.isFinite(prev) && prev !== 0;
  const pct = hasDelta ? ((current! - prev!) / Math.abs(prev!)) * 100 : 0;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const Icon = !hasDelta || Math.abs(pct) < 0.05 ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        "card-surface flex flex-col gap-1.5 p-4",
        emphasis && "ring-1 ring-primary/25",
      )}
    >
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-display font-semibold tracking-tight tabular-nums break-words",
          emphasis ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
        )}
      >
        {value}
      </span>
      {hasDelta ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {Math.abs(pct).toFixed(1)}% vs previous period
        </span>
      ) : (
        hint && <span className="text-xs text-muted-foreground">{hint}</span>
      )}
      {hasDelta && hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
