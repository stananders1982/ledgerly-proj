import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore, fmtMoney } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — Ledgerly" }] }),
  component: ReportsPage,
});

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const weekKey = (d: Date) => {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return dayKey(x);
};
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

function ReportsPage() {
  const { leads, expenses, revenues } = useStore();

  const buildBuckets = (keyFn: (d: Date) => string) => {
    const map = new Map<string, { key: string; revenue: number; expense: number; leads: number; activated: number }>();
    const ensure = (k: string) => {
      if (!map.has(k)) map.set(k, { key: k, revenue: 0, expense: 0, leads: 0, activated: 0 });
      return map.get(k)!;
    };
    revenues.forEach((r) => (ensure(keyFn(new Date(r.date))).revenue += r.amount));
    expenses.forEach((e) => (ensure(keyFn(new Date(e.date))).expense += e.amount));
    leads.forEach((l) => {
      const b = ensure(keyFn(new Date(l.date)));
      b.leads += 1;
      if (l.activated) b.activated += 1;
    });
    return Array.from(map.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((b) => ({ ...b, profit: b.revenue - b.expense }));
  };

  const daily = useMemo(() => buildBuckets(dayKey), [leads, expenses, revenues]);
  const weekly = useMemo(() => buildBuckets(weekKey), [leads, expenses, revenues]);
  const monthly = useMemo(() => buildBuckets(monthKey), [leads, expenses, revenues]);

  const bySource = useMemo(() => {
    const m = new Map<string, { source: string; leads: number; activated: number; cost: number; revenue: number }>();
    const ensure = (s: string) => {
      if (!m.has(s)) m.set(s, { source: s, leads: 0, activated: 0, cost: 0, revenue: 0 });
      return m.get(s)!;
    };
    leads.forEach((l) => {
      const b = ensure(l.source);
      b.leads += 1;
      b.cost += l.cost;
      if (l.activated) b.activated += 1;
      b.revenue += l.revenue;
    });
    revenues.forEach((r) => {
      if (!r.leadSource) return;
      ensure(r.leadSource).revenue += r.amount;
    });
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  }, [leads, revenues]);

  const byEmployee = useMemo(() => {
    const m = new Map<string, { employee: string; deals: number; revenue: number }>();
    revenues.forEach((r) => {
      const e = r.employee || "Unassigned";
      if (!m.has(e)) m.set(e, { employee: e, deals: 0, revenue: 0 });
      const b = m.get(e)!;
      b.deals += 1;
      b.revenue += r.amount;
    });
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  }, [revenues]);

  return (
    <div>
      <PageHeader title="Reports" description="Time-based summaries and performance breakdowns." />

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="source">Lead source</TabsTrigger>
          <TabsTrigger value="employee">Employees</TabsTrigger>
        </TabsList>

        <TabsContent value="daily"><PeriodTable label="Day" rows={daily} /></TabsContent>
        <TabsContent value="weekly"><PeriodTable label="Week of" rows={weekly} /></TabsContent>
        <TabsContent value="monthly"><PeriodTable label="Month" rows={monthly} /></TabsContent>

        <TabsContent value="source">
          <div className="card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Leads</th>
                    <th className="py-3 px-4">Activated</th>
                    <th className="py-3 px-4">Conv. rate</th>
                    <th className="py-3 px-4">Cost</th>
                    <th className="py-3 px-4">Revenue</th>
                    <th className="py-3 px-4">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {bySource.map((s) => {
                    const conv = s.leads ? (s.activated / s.leads) * 100 : 0;
                    const roi = s.cost ? ((s.revenue - s.cost) / s.cost) * 100 : 0;
                    return (
                      <tr key={s.source} className="border-b border-border/50">
                        <td className="py-3 px-4 font-medium">{s.source}</td>
                        <td className="py-3 px-4">{s.leads}</td>
                        <td className="py-3 px-4">{s.activated}</td>
                        <td className="py-3 px-4">{conv.toFixed(1)}%</td>
                        <td className="py-3 px-4">{fmtMoney(s.cost)}</td>
                        <td className="py-3 px-4 text-primary">{fmtMoney(s.revenue)}</td>
                        <td className={`py-3 px-4 ${roi >= 0 ? "text-primary" : "text-destructive"}`}>{roi.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="employee">
          <div className="card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Deals</th>
                    <th className="py-3 px-4">Revenue</th>
                    <th className="py-3 px-4">Avg deal</th>
                  </tr>
                </thead>
                <tbody>
                  {byEmployee.map((e) => (
                    <tr key={e.employee} className="border-b border-border/50">
                      <td className="py-3 px-4 font-medium">{e.employee}</td>
                      <td className="py-3 px-4">{e.deals}</td>
                      <td className="py-3 px-4 text-primary">{fmtMoney(e.revenue)}</td>
                      <td className="py-3 px-4">{fmtMoney(e.revenue / e.deals)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PeriodTable({
  label,
  rows,
}: {
  label: string;
  rows: { key: string; revenue: number; expense: number; profit: number; leads: number; activated: number }[];
}) {
  return (
    <div className="card-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="py-3 px-4">{label}</th>
              <th className="py-3 px-4">Revenue</th>
              <th className="py-3 px-4">Expenses</th>
              <th className="py-3 px-4">Profit</th>
              <th className="py-3 px-4">Leads</th>
              <th className="py-3 px-4">Activated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/50">
                <td className="py-3 px-4 font-medium">{r.key}</td>
                <td className="py-3 px-4 text-primary">{fmtMoney(r.revenue)}</td>
                <td className="py-3 px-4">{fmtMoney(r.expense)}</td>
                <td className={`py-3 px-4 font-medium ${r.profit >= 0 ? "text-primary" : "text-destructive"}`}>{fmtMoney(r.profit)}</td>
                <td className="py-3 px-4">{r.leads}</td>
                <td className="py-3 px-4">{r.activated}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
