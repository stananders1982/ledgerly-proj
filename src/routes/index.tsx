import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { DollarSign, TrendingDown, TrendingUp, Users, Target, Percent, Coins } from "lucide-react";
import { useStore, fmtMoney } from "@/lib/store";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Dashboard — Ledgerly" }],
  }),
  component: Dashboard,
});

const isToday = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
};
const isThisMonth = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
};

function Dashboard() {
  const { leads, expenses, revenues } = useStore();

  const m = useMemo(() => {
    const revToday = revenues.filter((r) => isToday(r.date)).reduce((s, r) => s + r.amount, 0);
    const revMonth = revenues.filter((r) => isThisMonth(r.date)).reduce((s, r) => s + r.amount, 0);
    const expToday = expenses.filter((e) => isToday(e.date)).reduce((s, e) => s + e.amount, 0);
    const expMonth = expenses.filter((e) => isThisMonth(e.date)).reduce((s, e) => s + e.amount, 0);
    const totalLeads = leads.length;
    const activated = leads.filter((l) => l.activated).length;
    const totalLeadCost = leads.reduce((s, l) => s + l.cost, 0);
    return {
      revToday,
      revMonth,
      expToday,
      expMonth,
      profitToday: revToday - expToday,
      profitMonth: revMonth - expMonth,
      totalLeads,
      activated,
      conversion: totalLeads ? (activated / totalLeads) * 100 : 0,
      cpl: totalLeads ? totalLeadCost / totalLeads : 0,
      cpal: activated ? totalLeadCost / activated : 0,
    };
  }, [leads, expenses, revenues]);

  const series = useMemo(() => {
    const days: Record<string, { date: string; revenue: number; expense: number; profit: number; leads: number; activated: number }> = {};
    const ensure = (key: string) =>
      (days[key] ??= { date: key, revenue: 0, expense: 0, profit: 0, leads: 0, activated: 0 });
    const start = new Date();
    start.setDate(start.getDate() - 29);
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      ensure(d.toISOString().slice(0, 10));
    }
    revenues.forEach((r) => {
      const k = r.date.slice(0, 10);
      if (days[k]) days[k].revenue += r.amount;
    });
    expenses.forEach((e) => {
      const k = e.date.slice(0, 10);
      if (days[k]) days[k].expense += e.amount;
    });
    leads.forEach((l) => {
      const k = l.date.slice(0, 10);
      if (days[k]) {
        days[k].leads += 1;
        if (l.activated) days[k].activated += 1;
      }
    });
    return Object.values(days)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, profit: d.revenue - d.expense, label: d.date.slice(5) }));
  }, [leads, expenses, revenues]);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Real-time pulse of revenue, spend, and lead efficiency across your sales pipeline."
      />

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue today" value={fmtMoney(m.revToday)} icon={DollarSign} tone="positive" />
        <StatCard label="Revenue this month" value={fmtMoney(m.revMonth)} icon={TrendingUp} />
        <StatCard label="Expenses today" value={fmtMoney(m.expToday)} icon={TrendingDown} />
        <StatCard label="Expenses this month" value={fmtMoney(m.expMonth)} icon={Coins} />
        <StatCard
          label="Profit today"
          value={fmtMoney(m.profitToday)}
          tone={m.profitToday >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Profit this month"
          value={fmtMoney(m.profitMonth)}
          tone={m.profitMonth >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Total leads" value={String(m.totalLeads)} icon={Users} />
        <StatCard label="Activated leads" value={String(m.activated)} icon={Target} />
      </section>

      <section className="grid gap-4 grid-cols-1 sm:grid-cols-3 mt-4">
        <StatCard label="Conversion rate" value={`${m.conversion.toFixed(1)}%`} icon={Percent} />
        <StatCard label="Cost per lead" value={fmtMoney(m.cpl)} />
        <StatCard label="Cost per activated lead" value={fmtMoney(m.cpal)} />
      </section>

      <section className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-8">
        <ChartCard title="Profit trend" subtitle="Last 30 days">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="g-profit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="profit" stroke="var(--chart-1)" fill="url(#g-profit)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue vs Expenses" subtitle="Last 30 days">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="g-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-exp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="var(--chart-2)" fill="url(#g-rev)" />
              <Area type="monotone" dataKey="expense" stroke="var(--chart-5)" fill="url(#g-exp)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Leads vs Activated" subtitle="Last 30 days" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="leads" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="activated" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-surface p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
