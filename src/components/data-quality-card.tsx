/**
 * Dashboard widget summarising open data-quality issues.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useDataQuality } from "@/routes/_authenticated/data-quality";

export function DataQualityCard() {
  const { open, total, isLoading } = useDataQuality();

  return (
    <div className="glass-surface glass-hover p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" /> Data quality
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Gaps that distort your reports</p>
        </div>
        <Link
          to="/data-quality"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          View all
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : open.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Everything looks clean.
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            <span className="font-display text-xl font-semibold text-foreground tabular-nums">{total}</span>{" "}
            records need attention across {open.length} check{open.length === 1 ? "" : "s"}.
          </p>
          <ul className="space-y-2">
            {open
              .slice()
              .sort((a, b) => b.count - a.count)
              .slice(0, 4)
              .map((i) => (
                <li key={i.key}>
                  <Link
                    to={i.to}
                    search={{ issue: i.key } as any}
                    className="flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="min-w-0 flex-1 truncate text-sm">{i.label}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{i.count}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
