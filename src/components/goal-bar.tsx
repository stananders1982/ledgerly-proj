import { cn } from "@/lib/utils";

/** Progress bar for a monthly goal (FTDs, STDs, revenue). */
export function GoalBar({
  value,
  target,
  format = (n: number) => String(n),
  label,
}: {
  value: number;
  target?: number | null;
  format?: (n: number) => string;
  label?: string;
}) {
  if (!target || target <= 0) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.min(100, (value / target) * 100);
  const done = value >= target;
  return (
    <div className="min-w-[120px]">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("num font-medium", done ? "text-emerald-500" : "text-foreground")}>
          {format(value)} / {format(target)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", done ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
