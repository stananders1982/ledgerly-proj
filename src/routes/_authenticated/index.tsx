import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, DollarSign, Repeat, Target, TrendingDown, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPct } from "@/lib/format";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Ledgerly" }] }),
  component: Dashboard,
});

function Dashboard() {
  const now = new Date();
  const month = now.toISOString().slice(0, 7); // YYYY-MM
  const start = `${month}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const leadsQ = useQuery({
    queryKey: ["dash-leads", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_entries")
        .select("received,converted,reported,cost")
        .gte("entry_date", start).lte("entry_date", end);
      if (error) throw error;
      return data ?? [];
    },
  });
  const revQ = useQuery({
    queryKey: ["dash-rev", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue").select("amount").gte("date", start).lte("date", end);
      if (error) throw error;
      return data ?? [];
    },
  });
  const expQ = useQuery({
    queryKey: ["dash-exp", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses").select("amount").gte("date", start).lte("date", end);
      if (error) throw error;
      return data ?? [];
    },
  });
  const empQ = useQuery({
    queryKey: ["dash-emp"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees").select("salary,commission_pct,active").eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const recQ = useQuery({
    queryKey: ["dash-recurring"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("amount,frequency,next_due_date,active,end_date").eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const m = useMemo(() => {
    const leads = leadsQ.data ?? [];
    const received = leads.reduce((s, r) => s + Number(r.received), 0);
    const converted = leads.reduce((s, r) => s + Number(r.converted), 0);
    const leadCost = leads.reduce((s, r) => s + Number(r.cost), 0);
    const income = (revQ.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const otherExp = (expQ.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const salaries = (empQ.data ?? []).reduce((s, e) => s + Number(e.salary), 0);
    const commissions = (empQ.data ?? []).reduce(
      (s, e) => s + (income * Number(e.commission_pct)) / 100, 0);
    const expTotal = leadCost + otherExp + salaries + commissions;

    // Recurring
    const rec = recQ.data ?? [];
    const monthlyEquiv = (a: number, f: string) =>
      f === "weekly" ? a * 52 / 12 : f === "quarterly" ? a / 3 : f === "yearly" ? a / 12 : a;
    const recurringMonthly = rec.reduce((s, r: any) => s + monthlyEquiv(Number(r.amount), r.frequency), 0);
    const fixedMonthly = recurringMonthly + salaries;
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const upcoming30 = rec
      .filter((r: any) => r.next_due_date && new Date(r.next_due_date) <= in30)
      .reduce((s, r: any) => s + Number(r.amount), 0);
    const breakEven = fixedMonthly; // monthly revenue needed to cover fixed costs

    return {
      income, leadCost, otherExp, salaries, commissions,
      expTotal, profit: income - expTotal,
      received, converted,
      rate: received ? (converted / received) * 100 : 0,
      cpl: received ? leadCost / received : 0,
      recurringMonthly, fixedMonthly, upcoming30, breakEven,
    };
  }, [leadsQ.data, revQ.data, expQ.data, empQ.data, recQ.data]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`This month — ${new Date().toLocaleString(undefined, { month: "long", year: "numeric" })}`}
      />

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Income" value={fmtMoney(m.income)} icon={DollarSign} tone="positive" />
        <StatCard label="Total expenses" value={fmtMoney(m.expTotal)} icon={TrendingDown} />
        <StatCard label="Net profit" value={fmtMoney(m.profit)} icon={TrendingUp}
          tone={m.profit >= 0 ? "positive" : "negative"} />
        <StatCard label="Leads received" value={String(m.received)} icon={Users} />
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Converted" value={String(m.converted)} />
        <StatCard label="Conv. rate" value={fmtPct(m.rate)} />
        <StatCard label="Lead cost" value={fmtMoney(m.leadCost)} />
        <StatCard label="Cost / lead" value={fmtMoney(m.cpl)} />
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Fixed monthly costs" value={fmtMoney(m.fixedMonthly)} icon={Repeat} />
        <StatCard label="Recurring monthly" value={fmtMoney(m.recurringMonthly)} icon={Repeat} />
        <StatCard label="Upcoming (30d)" value={fmtMoney(m.upcoming30)} icon={CalendarClock} />
        <StatCard label="Break-even revenue" value={fmtMoney(m.breakEven)} icon={Target}
          tone={m.income >= m.breakEven ? "positive" : "negative"} />
      </section>

      <section className="card-surface p-5">
        <h3 className="font-display text-base font-semibold mb-3">Expense breakdown</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Row label="Lead cost" value={fmtMoney(m.leadCost)} />
          <Row label="Other expenses" value={fmtMoney(m.otherExp)} />
          <Row label="Salaries" value={fmtMoney(m.salaries)} />
          <Row label="Commissions" value={fmtMoney(m.commissions)} />
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
