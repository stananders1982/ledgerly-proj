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
  const month = now.toISOString().slice(0, 7);
  const start = `${month}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const leadsQ = useQuery({
    queryKey: ["dash-leads-v2", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("activated,reported,lead_sources(pricing_model,price)")
        .gte("created_at", `${start}T00:00:00`).lte("created_at", `${end}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const revQ = useQuery({
    queryKey: ["dash-rev", month],
    queryFn: async () => (await supabase.from("revenue").select("amount").gte("date", start).lte("date", end)).data ?? [],
  });
  const expQ = useQuery({
    queryKey: ["dash-exp", month],
    queryFn: async () => (await supabase.from("expenses").select("amount").gte("date", start).lte("date", end)).data ?? [],
  });
  const empQ = useQuery({
    queryKey: ["dash-emp"],
    queryFn: async () => (await supabase.from("employees").select("salary,commission_pct,active").eq("active", true)).data ?? [],
  });
  const recQ = useQuery({
    queryKey: ["dash-recurring"],
    queryFn: async () => (await supabase.from("recurring_expenses").select("amount,frequency,next_due_date,active,end_date").eq("active", true)).data ?? [],
  });

  const m = useMemo(() => {
    const leads = (leadsQ.data ?? []) as any[];
    const received = leads.length;
    const activated = leads.filter((l) => l.activated).length;
    const reported = leads.filter((l) => l.activated && l.reported).length;
    const unreported = activated - reported;

    let cplCost = 0, cpaPayable = 0, cpaSavings = 0;
    for (const l of leads) {
      const s = l.lead_sources;
      if (!s) continue;
      const p = Number(s.price);
      if (s.pricing_model === "CPL") cplCost += p;
      else {
        if (l.activated && l.reported) cpaPayable += p;
        if (l.activated && !l.reported) cpaSavings += p;
      }
    }
    const leadCost = cplCost + cpaPayable;

    const income = (revQ.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const otherExp = (expQ.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const salaries = (empQ.data ?? []).reduce((s: number, e: any) => s + Number(e.salary), 0);
    const commissions = (empQ.data ?? []).reduce((s: number, e: any) => s + (income * Number(e.commission_pct)) / 100, 0);
    const expTotal = leadCost + otherExp + salaries + commissions;

    const rec = (recQ.data ?? []) as any[];
    const monthlyEquiv = (a: number, f: string) =>
      f === "weekly" ? a * 52 / 12 : f === "quarterly" ? a / 3 : f === "yearly" ? a / 12 : a;
    const recurringMonthly = rec.reduce((s, r) => s + monthlyEquiv(Number(r.amount), r.frequency), 0);
    const fixedMonthly = recurringMonthly + salaries;
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const upcoming30 = rec.filter((r) => r.next_due_date && new Date(r.next_due_date) <= in30)
      .reduce((s, r) => s + Number(r.amount), 0);

    return {
      income, leadCost, otherExp, salaries, commissions, expTotal,
      profit: income - expTotal,
      received, activated, reported, unreported,
      cplCost, cpaPayable, cpaSavings,
      rate: received ? (activated / received) * 100 : 0,
      recurringMonthly, fixedMonthly, upcoming30, breakEven: fixedMonthly,
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
        <StatCard label="Activated leads" value={String(m.activated)} tone="positive" />
        <StatCard label="Reported activations" value={String(m.reported)} />
        <StatCard label="Unreported activations" value={String(m.unreported)} />
        <StatCard label="Conv. rate" value={fmtPct(m.rate)} />
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="CPL costs" value={fmtMoney(m.cplCost)} />
        <StatCard label="CPA payable" value={fmtMoney(m.cpaPayable)} />
        <StatCard label="CPA savings" value={fmtMoney(m.cpaSavings)} tone="positive" />
        <StatCard label="Lead cost (total)" value={fmtMoney(m.leadCost)} />
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

