import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "success" | "warning" | "danger" | "info" | "muted" | "accent";

const toneClass: Record<Tone, string> = {
  success: "bg-success/15 text-success border-success/25",
  warning: "bg-warning/15 text-warning border-warning/25",
  danger: "bg-destructive/15 text-destructive border-destructive/25",
  info: "bg-chart-2/15 text-chart-2 border-chart-2/25",
  accent: "bg-chart-4/15 text-chart-4 border-chart-4/25",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({
  tone = "muted",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <StatusBadge tone={active ? "success" : "muted"}>{active ? "Active" : "Inactive"}</StatusBadge>;
}

export function AnsweredBadge({ answered }: { answered: boolean }) {
  return (
    <StatusBadge tone={answered ? "success" : "warning"}>{answered ? "Answered" : "Unanswered"}</StatusBadge>
  );
}

export function PotentialBadge({ potential, prefix }: { potential?: string | null; prefix?: string }) {
  const p = (potential ?? "").toLowerCase();
  const tone: Tone = p === "high" ? "success" : p === "mid" ? "warning" : p === "low" ? "danger" : "muted";
  const label = p ? p.charAt(0).toUpperCase() + p.slice(1) : "—";
  return (
    <StatusBadge tone={tone} title="Agent's read of how much this client can deposit">
      {prefix ? <span className="font-normal opacity-70">{prefix}</span> : null}
      {label}
    </StatusBadge>
  );
}

export function PricingModelBadge({ model }: { model?: string | null }) {
  return <StatusBadge tone={model === "CPA" ? "accent" : "info"}>{model ?? "—"}</StatusBadge>;
}

/**
 * Marks an FTD that only qualified because retention deposited later — the
 * conversion agent is still credited, in the month it qualified.
 */
export function LateFtdBadge({
  activationDate,
  qualifiedAt,
  months,
  className,
}: {
  activationDate?: string | null;
  qualifiedAt?: string | null;
  months?: number;
  className?: string;
}) {
  const parts = [
    activationDate ? `Activated ${String(activationDate).slice(0, 10)}` : null,
    qualifiedAt ? `qualified ${String(qualifiedAt).slice(0, 10)}` : null,
    months && months > 0 ? `${months} month${months === 1 ? "" : "s"} later` : null,
  ].filter(Boolean);
  return (
    <StatusBadge
      tone="warning"
      className={className}
      title={`Late FTD - retention deposit${parts.length ? ` (${parts.join(", ")})` : ""}`}
    >
      Late (retention)
    </StatusBadge>
  );
}
