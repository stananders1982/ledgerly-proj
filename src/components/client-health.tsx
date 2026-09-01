import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/format";
import {
  HEALTH_BAND_DOT, HEALTH_BAND_LABEL, HEALTH_BAND_TONE, type ClientHealth,
} from "@/lib/client-health";

/** Compact pill for tables and headers. `prefix` names the dimension. */
export function HealthBadge({ health, showScore = true, prefix }: { health: ClientHealth; showScore?: boolean; prefix?: string }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 whitespace-nowrap ${HEALTH_BAND_TONE[health.band]}`}
      title={`Health score ${health.score}/100 — ${HEALTH_BAND_LABEL[health.band]}`}
    >
      <span aria-hidden>{HEALTH_BAND_DOT[health.band]}</span>
      {prefix ? <span className="font-normal opacity-70">{prefix}</span> : null}
      {showScore ? `${health.score}` : null}
      <span className="font-normal">{HEALTH_BAND_LABEL[health.band]}</span>
    </Badge>
  );
}


/** Full breakdown: the score, the band and every factor that moved it. */
export function ClientHealthCard({ health }: { health: ClientHealth }) {
  const pct = Math.max(0, Math.min(100, health.score));
  const bar =
    health.band === "critical" ? "bg-rose-500"
      : health.band === "at-risk" ? "bg-amber-500"
        : health.band === "upsell" ? "bg-sky-500"
          : "bg-emerald-500";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">Client health</h2>
        <HealthBadge health={health} showScore={false} />
      </div>

      <div className="flex items-baseline gap-2">
        <span className="num text-3xl font-semibold tabular-nums">{health.score}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{health.advice}</p>

      <dl className="mt-4 space-y-1.5 text-sm">
        {health.factors.map((f) => (
          <div key={f.key} className="flex items-start justify-between gap-3">
            <dt className="min-w-0">
              <span className="block truncate">{f.label}</span>
              <span className="block text-xs text-muted-foreground">{f.detail}</span>
            </dt>
            <dd
              className={`num shrink-0 tabular-nums ${
                f.points > 0 ? "text-emerald-500" : f.points < 0 ? "text-rose-500" : "text-muted-foreground"
              }`}
            >
              {f.points > 0 ? "+" : ""}{f.points}
            </dd>
          </div>
        ))}
      </dl>

      {health.headroom != null && (
        <p className="mt-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          Estimated headroom left: <span className="num font-medium text-foreground">{fmtMoney(health.headroom)}</span>
        </p>
      )}
    </div>
  );
}
