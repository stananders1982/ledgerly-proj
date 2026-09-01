import { BarChart3, Briefcase, CalendarClock, DollarSign, LayoutList, PiggyBank, TrendingDown, TrendingUp, Users, Wallet, AlertCircle, BadgeDollarSign, HandCoins } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { fmtMoney, getDisplayCurrency } from "@/lib/format";
import { toDisplay } from "@/lib/fx";
import type { DashboardSummary } from "@/lib/dashboards.functions";
import { cn } from "@/lib/utils";

function money(n: number) {
  return fmtMoney(toDisplay(n, "USD"));
}

export const widgetComponents: Record<string, React.FC<{ data: DashboardSummary; title?: string }>> = {
  revenue: ({ data, title }) => (
    <StatCard label={title ?? "Revenue"} value={money(data.revenue)} icon={DollarSign} tone="positive" hint="Income recorded in period" />
  ),
  profit: ({ data, title }) => (
    <StatCard label={title ?? "Profit"} value={money(data.profit)} icon={PiggyBank} tone={data.profit >= 0 ? "positive" : "negative"} hint="Revenue − expenses − withdrawals" />
  ),
  ftd: ({ data, title }) => (
    <StatCard label={title ?? "FTDs"} value={String(data.ftdCount)} icon={Users} hint="First-time deposits this period" />
  ),
  std: ({ data, title }) => (
    <StatCard label={title ?? "STDs"} value={String(data.stdCount)} icon={TrendingUp} hint="Second-time deposits (conservative)" />
  ),
  withdrawals: ({ data, title }) => (
    <StatCard label={title ?? "Withdrawals"} value={money(data.withdrawals)} icon={TrendingDown} tone="negative" hint={`${fmtMoney(toDisplay(data.pendingWithdrawals, "USD"))} pending`} />
  ),
  expenses: ({ data, title }) => (
    <StatCard label={title ?? "Expenses"} value={money(data.expenses)} icon={Wallet} tone="negative" hint="Costs recorded in period" />
  ),
  affiliates: ({ data, title }) => (
    <StatCard label={title ?? "Affiliate debt"} value={money(data.affiliateDebt)} icon={HandCoins} hint="Approved affiliate CPA owed" />
  ),
  tasks: ({ data, title }) => (
    <StatCard label={title ?? "Overdue tasks"} value={String(data.overdueTasks)} icon={AlertCircle} tone={data.overdueTasks > 0 ? "negative" : "default"} hint="Tasks past due date" />
  ),
  cash: ({ data, title }) => (
    <div className="card-surface h-full p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title ?? "Cash position"}</span>
        <BadgeDollarSign className="h-4 w-4 text-primary" />
      </div>
      <div className="grid grid-cols-2 gap-3 flex-1">
        <CashItem label="Today" value={data.cash.today} />
        <CashItem label="+7 days" value={data.cash.d7} />
        <CashItem label="+30 days" value={data.cash.d30} />
        <CashItem label="+90 days" value={data.cash.d90} />
      </div>
      <div className="mt-3 text-xs text-muted-foreground">Committed expenses (30d): <span className="font-medium text-foreground">{money(data.cash.committedExpenses)}</span></div>
    </div>
  ),
  forecast: ({ data, title }) => (
    <div className="card-surface h-full p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title ?? "Cash forecast"}</span>
        <CalendarClock className="h-4 w-4 text-primary" />
      </div>
      <div className="space-y-3 flex-1">
        <ForecastBar label="Today" value={data.cash.today} max={Math.max(data.cash.d90, 1)} />
        <ForecastBar label="7 days" value={data.cash.d7} max={Math.max(data.cash.d90, 1)} />
        <ForecastBar label="30 days" value={data.cash.d30} max={Math.max(data.cash.d90, 1)} />
        <ForecastBar label="90 days" value={data.cash.d90} max={Math.max(data.cash.d90, 1)} />
      </div>
    </div>
  ),
  clients: ({ data, title }) => (
    <div className="card-surface h-full p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title ?? "Client health"}</span>
        <Briefcase className="h-4 w-4 text-primary" />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <HealthPill label="Active" value={data.clients.total} />
        <HealthPill label="Whales" value={data.clients.whale} tone="positive" />
        <HealthPill label="Neglected" value={data.clients.neglected} tone={data.clients.neglected > 0 ? "negative" : "default"} />
      </div>
      <div className="text-xs text-muted-foreground mt-auto">Neglected = no deposit in selected period</div>
    </div>
  ),
  sources: ({ data, title }) => (
    <div className="card-surface h-full p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title ?? "Top sources"}</span>
        <BarChart3 className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 overflow-auto">
        {data.sources.length === 0 && <div className="text-sm text-muted-foreground">No sources in period</div>}
        {data.sources.map((s) => (
          <div key={s.name} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
            <div className="text-sm truncate max-w-[55%]">{s.name}</div>
            <div className="text-xs tabular-nums text-muted-foreground">{s.leads} leads · {s.conversions} conv · {fmtMoney(s.roi)}%</div>
          </div>
        ))}
      </div>
    </div>
  ),
  employees: ({ data, title }) => (
    <div className="card-surface h-full p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title ?? "Top employees"}</span>
        <LayoutList className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 overflow-auto">
        {data.employees.length === 0 && <div className="text-sm text-muted-foreground">No revenue in period</div>}
        {data.employees.map((e) => (
          <div key={e.name} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
            <div className="text-sm truncate max-w-[55%]">{e.name}</div>
            <div className="text-xs tabular-nums font-medium">{money(e.value)}</div>
          </div>
        ))}
      </div>
    </div>
  ),
};

function CashItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="font-display text-lg font-semibold num">{money(value)}</div>
    </div>
  );
}

function ForecastBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium num">{money(value)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HealthPill({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "positive" | "negative" }) {
  return (
    <div className={cn("rounded-lg p-2 text-center", tone === "positive" && "bg-emerald-500/10", tone === "negative" && "bg-rose-500/10", tone === "default" && "bg-muted/40")}>
      <div className={cn("text-lg font-display font-semibold", tone === "positive" && "text-emerald-600 dark:text-emerald-300", tone === "negative" && "text-rose-600 dark:text-rose-300")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
