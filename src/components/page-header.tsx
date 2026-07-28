import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Filters, search inputs, date pickers — rendered on a second row on mobile. */
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 space-y-4", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <h1 className="truncate font-display text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
    </div>
  );
}
