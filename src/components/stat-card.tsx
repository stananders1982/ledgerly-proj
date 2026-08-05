import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  delta?: number;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "negative";
  hint?: ReactNode;
}


export function StatCard({ label, value, delta, icon: Icon, tone = "default", hint }: Props) {
  const trendUp = (delta ?? 0) >= 0;
  return (
    <div className="card-surface p-5 flex flex-col gap-3 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && (
          <div className="h-8 w-8 rounded-md bg-accent/60 flex items-center justify-center text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div
        className={cn(
          "font-display text-3xl font-semibold tracking-tight",
          tone === "positive" && "text-primary",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground -mt-1">{hint}</div>}
      {delta !== undefined && (
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            trendUp ? "text-primary" : "text-destructive",
          )}
        >
          {trendUp ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {Math.abs(delta).toFixed(1)}% vs last period
        </div>
      )}
    </div>
  );
}
