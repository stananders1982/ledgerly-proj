import { CheckCircle2, Circle, CalendarClock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, fmtMoney } from "@/lib/format";

export type JourneyStage = {
  key: string;
  label: string;
  /** Date the stage happened, when it did. */
  date?: string | null;
  /** Extra detail line (amount, agent, channel…). */
  detail?: string | null;
  done: boolean;
};

/**
 * Horizontal-on-desktop stage rail showing where a client stands:
 * lead → activation → first deposit → qualified → repeat deposit → contact.
 */
export function ClientJourney({
  stages,
  nextSteps,
}: {
  stages: JourneyStage[];
  nextSteps: { label: string; value: string; icon?: "date" | "ai" }[];
}) {
  const doneCount = stages.filter((s) => s.done).length;
  const pct = stages.length ? Math.round((doneCount / stages.length) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">Client journey</h2>
        <span className="text-xs text-muted-foreground">
          {doneCount} of {stages.length} stages · {pct}%
        </span>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((s) => (
          <li
            key={s.key}
            className={cn(
              "rounded-lg border p-3",
              s.done ? "border-primary/40 bg-primary/[0.04]" : "border-dashed border-border",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              {s.done ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={s.done ? undefined : "text-muted-foreground"}>{s.label}</span>
            </div>
            <p className="mt-1 pl-6 text-xs text-muted-foreground">
              {s.done ? (s.date ? fmtDate(String(s.date).slice(0, 10)) : "Done") : "Not yet"}
              {s.detail ? ` · ${s.detail}` : ""}
            </p>
          </li>
        ))}
      </ol>

      {nextSteps.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-foreground/[0.02] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next steps</p>
          <ul className="space-y-1.5 text-sm">
            {nextSteps.map((n) => (
              <li key={n.label} className="flex items-start gap-2">
                {n.icon === "ai" ? (
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary" />
                ) : (
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span>
                  <span className="text-muted-foreground">{n.label}: </span>
                  {n.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Money detail helper so callers stay terse. */
export const journeyAmount = (n: number) => fmtMoney(n);
