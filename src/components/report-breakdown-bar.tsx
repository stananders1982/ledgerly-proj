import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BreakdownSlice = { label: string; value: number; className: string };

/**
 * One horizontal stacked bar that shows where the revenue went:
 * each cost bucket plus the profit that is left over.
 */
export function ReportBreakdownBar({
  total,
  slices,
  className,
}: {
  total: number;
  slices: BreakdownSlice[];
  className?: string;
}) {
  const positive = slices.filter((s) => s.value > 0);
  const sum = positive.reduce((s, x) => s + x.value, 0) || 1;
  const base = Math.max(total, sum) || 1;

  return (
    <div className={cn("card-surface p-5", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Where the money goes
        </h3>
        <span className="text-xs text-muted-foreground">Revenue {fmtMoney(total)}</span>
      </div>

      <div className="flex h-6 w-full overflow-hidden rounded-md bg-muted">
        {positive.map((s) => (
          <div
            key={s.label}
            className={cn("h-full transition-all", s.className)}
            style={{ width: `${(s.value / base) * 100}%` }}
            title={`${s.label}: ${fmtMoney(s.value)}`}
          />
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 min-w-0">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", s.className)} />
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className="ml-auto text-xs font-medium tabular-nums">{fmtMoney(s.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
