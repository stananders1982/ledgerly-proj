import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center px-6",
      compact ? "py-8" : "py-16"
    )}>
      <div className="h-12 w-12 rounded-full bg-accent/60 text-muted-foreground flex items-center justify-center mb-4">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function InlineEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-10 px-6 text-center sm:text-left rounded-lg border border-dashed border-border bg-accent/20">
      <div className="h-10 w-10 rounded-full bg-accent/60 text-muted-foreground flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="max-w-sm">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {action && <div className="sm:ml-auto">{action}</div>}
    </div>
  );
}
