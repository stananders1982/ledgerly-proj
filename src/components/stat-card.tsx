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
  onClick?: () => void;
}


export function StatCard({ label, value, delta, icon: Icon, tone = "default", hint, onClick }: Props) {
  const trendUp = (delta ?? 0) >= 0;
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        "card-surface p-4 sm:p-5 flex flex-col gap-2 relative overflow-hidden transition-all duration-200",
        onClick && "cursor-pointer hover:border-primary/40 hover:shadow-[0_10px_30px_-18px_var(--primary)]",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{label}</span>
        {Icon && (
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div
        className={cn(
          "font-display text-2xl sm:text-[1.75rem] font-semibold tracking-[-0.02em] break-words num",
          tone === "positive" && "text-money-up",
          tone === "negative" && "text-money-down",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground -mt-1">{hint}</div>}
      {delta !== undefined && (
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            trendUp ? "text-money-up" : "text-money-down",
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
