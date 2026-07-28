import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CardField = { label: string; value: ReactNode };

/**
 * Mobile-friendly stacked card rendering of a table row.
 * Use inside a `md:hidden` wrapper alongside a `hidden md:table` table.
 */
export function DataCard({
  title,
  subtitle,
  fields,
  actions,
  onClick,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  fields: CardField[];
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border border-border bg-card/60 p-4",
        onClick && "cursor-pointer active:bg-accent/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
        {actions && (
          <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {fields.map((f, i) => (
          <div key={i} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{f.label}</dt>
            <dd className="truncate text-sm">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DataCardList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-3 p-3 md:hidden", className)}>{children}</div>;
}
