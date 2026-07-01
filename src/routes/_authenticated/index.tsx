import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";

import {
  Activity,
  CalendarClock,
  DollarSign,
  Repeat,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Ledgerly" }] }),
  component: Dashboard,
});

type Tone = "green" | "red" | "blue" | "purple" | "amber" | "neutral";

const toneStyles: Record<Tone, { glow: string; ring: string; text: string; stroke: string; fill: string }> = {
  green:   { glow: "glow-green",  ring: "bg-emerald-500/15 text-emerald-300", text: "text-emerald-300", stroke: "oklch(0.78 0.18 160)", fill: "oklch(0.72 0.18 160 / 0.35)" },
  red:     { glow: "glow-red",    ring: "bg-rose-500/15 text-rose-300",       text: "text-rose-300",    stroke: "oklch(0.7 0.22 25)",    fill: "oklch(0.65 0.22 25 / 0.35)" },
  blue:    { glow: "glow-blue",   ring: "bg-sky-500/15 text-sky-300",         text: "text-sky-300",     stroke: "oklch(0.75 0.17 250)",  fill: "oklch(0.7 0.17 250 / 0.35)" },
  purple:  { glow: "glow-purple", ring: "bg-fuchsia-500/15 text-fuchsia-300", text: "text-fuchsia-300", stroke: "oklch(0.76 0.2 320)",   fill: "oklch(0.7 0.2 320 / 0.35)" },
  amber:   { glow: "glow-amber",  ring: "bg-amber-500/15 text-amber-300",     text: "text-amber-300",   stroke: "oklch(0.82 0.16 75)",   fill: "oklch(0.78 0.16 75 / 0.35)" },
  neutral: { glow: "",            ring: "bg-white/5 text-muted-foreground",   text: "text-foreground",  stroke: "oklch(0.7 0.02 260)",   fill: "oklch(0.7 0.02 260 / 0.25)" },
};

function Dashboard() {
  const qc = useQueryClient();
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const range = getRange(rangeKey, { start: customStart, end: customEnd });
  const startIso = iso(range.start);
  const endIso = iso(range.end);
  const rangeLabel = range.label;

  // Auto-generate any due recurring expenses so dashboard reflects them
  useEffect(() => {
    import("@/lib/recurring.functions").then(({ generateDueRecurringExpenses }) =>
      generateDueRecurringExpenses().then((res) => {
        if (res?.count > 0) {
          qc.invalidateQueries({ queryKey: ["dash-exp"] });
          qc.invalidateQueries({ queryKey: ["expenses-list"] });
        }
      }).catch(() => {})
    );
  }, [qc]);

  const leadsQ = useQuery({
    queryKey: ["dash-leads", startIso, endIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_entries")
        .select("entry_date,received,activated,reported,lead_sources(name,pricing_model,price,expected_conversion_rate)")
        .gte("entry_date", startIso).lte("entry_date", endIso);
      if (error) throw error;
      return data ?? [];
    },
  });

  const revQ = useQuery({
    queryKey: ["dash-rev", startIso, endIso],
    queryFn: async () => (await supabase.from("revenue").select("amount,date").gte("date", startIso).lte("date", endIso)).data ?? [],
  });
  const expQ = useQuery({
    queryKey: ["dash-exp", startIso, endIso],
    queryFn: async () => (await supabase.from("expenses").select("amount,date").gte("date", startIso).lte("date", endIso)).data ?? [],
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
    const entries = (leadsQ.data ?? []) as any[];
    const rangeEntries = entries; // already filtered by query

    const agg = (arr: any[]) => {
      let received = 0, activated = 0, reported = 0;
      let cplCost = 0, cpaPayable = 0, cpaSavings = 0;
      let expectedActivations = 0;
      for (const e of arr) {
        received += e.received ?? 0;
        activated += e.activated ?? 0;
        reported += e.reported ?? 0;
        const s = e.lead_sources;
        if (!s) continue;
        const p = Number(s.price);
        const expected = Number(s.expected_conversion_rate) || 0;
        expectedActivations += ((e.received ?? 0) * expected) / 100;
        if (s.pricing_model === "CPL") cplCost += p * (e.received ?? 0);
        else {
          cpaPayable += p * (e.reported ?? 0);
          cpaSavings += p * Math.max(0, (e.activated ?? 0) - (e.reported ?? 0));
        }
      }
      return { received, activated, reported, cplCost, cpaPayable, cpaSavings, expectedActivations };
    };

    const a = agg(rangeEntries);
    const leadCost = a.cplCost + a.cpaPayable;

    const rangeRev = (revQ.data ?? []);
    const rangeExp = (expQ.data ?? []);

    // Scale salaries + expected commissions to the length of the selected range
    const msPerDay = 86_400_000;
    const days = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / msPerDay) + 1);
    const monthFactor = days / 30;

    const income = rangeRev.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const otherExp = rangeExp.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const salariesMonthly = (empQ.data ?? []).reduce((s: number, e: any) => s + Number(e.salary), 0);
    const salaries = salariesMonthly * monthFactor;
    const commissions = (empQ.data ?? []).reduce((s: number, e: any) => s + (income * Number(e.commission_pct)) / 100, 0);
    const expTotal = leadCost + otherExp + salaries + commissions;
    const profit = income - expTotal;

    const rec = (recQ.data ?? []) as any[];
    const monthlyEquiv = (amt: number, f: string) =>
      f === "weekly" ? amt * 52 / 12 : f === "quarterly" ? amt / 3 : f === "yearly" ? amt / 12 : amt;
    const recurringMonthly = rec.reduce((s, r) => s + monthlyEquiv(Number(r.amount), r.frequency), 0);
    const fixedMonthly = recurringMonthly + salariesMonthly;
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const upcoming30 = rec.filter((r) => r.next_due_date && new Date(r.next_due_date) <= in30)
      .reduce((s, r) => s + Number(r.amount), 0);

    // Build daily series across the selected range
    const dayList: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(range.start); d.setDate(d.getDate() + i);
      const y = d.getFullYear(); const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      dayList.push(`${y}-${mo}-${da}`);
    }
    const revMap = new Map<string, number>();
    rangeRev.forEach((r: any) => revMap.set(r.date, (revMap.get(r.date) ?? 0) + Number(r.amount)));
    const expMap = new Map<string, number>();
    rangeExp.forEach((r: any) => expMap.set(r.date, (expMap.get(r.date) ?? 0) + Number(r.amount)));
    const leadDay = new Map<string, { received: number; activated: number; cost: number }>();
    entries.forEach((e: any) => {
      const cur = leadDay.get(e.entry_date) ?? { received: 0, activated: 0, cost: 0 };
      cur.received += e.received ?? 0;
      cur.activated += e.activated ?? 0;
      const s = e.lead_sources;
      if (s) {
        const p = Number(s.price);
        cur.cost += s.pricing_model === "CPL" ? p * (e.received ?? 0) : p * (e.reported ?? 0);
      }
      leadDay.set(e.entry_date, cur);
    });
    const series = dayList.map((d) => ({
      date: d,
      label: d.slice(5),
      revenue: revMap.get(d) ?? 0,
      expenses: (expMap.get(d) ?? 0) + (leadDay.get(d)?.cost ?? 0),
      received: leadDay.get(d)?.received ?? 0,
      activated: leadDay.get(d)?.activated ?? 0,
    }));
    const profitSeries = series.map((s) => ({ ...s, profit: s.revenue - s.expenses }));

    // Source performance (this range)
    const bySource = new Map<string, { name: string; received: number; activated: number; expected: number; cost: number }>();
    rangeEntries.forEach((e: any) => {
      const s = e.lead_sources; if (!s) return;
      const key = s.name ?? "Unknown";
      const cur = bySource.get(key) ?? { name: key, received: 0, activated: 0, expected: 0, cost: 0 };
      cur.received += e.received ?? 0;
      cur.activated += e.activated ?? 0;
      cur.expected += ((e.received ?? 0) * (Number(s.expected_conversion_rate) || 0)) / 100;
      const p = Number(s.price);
      cur.cost += s.pricing_model === "CPL" ? p * (e.received ?? 0) : p * (e.reported ?? 0);
      bySource.set(key, cur);
    });
    const sourceRows = [...bySource.values()]
      .map((r) => ({ ...r, rate: r.received ? (r.activated / r.received) * 100 : 0 }))
      .sort((a, b) => b.activated - a.activated)
      .slice(0, 6);

    const rate = a.received ? (a.activated / a.received) * 100 : 0;
    const expectedRate = a.received ? (a.expectedActivations / a.received) * 100 : 0;
    const roi = expTotal ? ((income - expTotal) / expTotal) * 100 : 0;

    return {
      income, leadCost, otherExp, salaries, commissions, expTotal, profit,
      received: a.received, activated: a.activated, reported: a.reported,
      unreported: a.activated - a.reported,
      cplCost: a.cplCost, cpaPayable: a.cpaPayable, cpaSavings: a.cpaSavings,
      rate, expectedRate,
      expectedActivations: a.expectedActivations,
      activationSurplus: a.activated - a.expectedActivations,
      recurringMonthly, fixedMonthly, upcoming30, breakEven: fixedMonthly,
      roi,
      series: profitSeries, sourceRows,
    };
  }, [leadsQ.data, revQ.data, expQ.data, empQ.data, recQ.data, range.start, range.end]);


  const insights = useMemo(() => buildInsights(m), [m]);

  return (
    <div className="aurora-bg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live control center
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            {greeting()}, here's your business pulse.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <DateRangePicker
          value={rangeKey}
          onChange={setRangeKey}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
        />
      </div>


      {/* Hero KPIs */}
      <section className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 mb-10">
        <HeroCard
          label="Net profit"
          value={fmtMoney(m.profit)}
          tone={m.profit >= 0 ? "green" : "red"}
          icon={TrendingUp}
          sub={`ROI ${m.roi.toFixed(1)}%`}
          data={m.series.map((s) => ({ v: s.profit }))}
          primary
        />
        <HeroCard
          label="Revenue"
          value={fmtMoney(m.income)}
          tone="blue"
          icon={DollarSign}
          sub={rangeLabel}
          data={m.series.map((s) => ({ v: s.revenue }))}
        />
        <HeroCard
          label="Expenses"
          value={fmtMoney(m.expTotal)}
          tone="red"
          icon={TrendingDown}
          sub={`Lead cost ${fmtMoney(m.leadCost)}`}
          data={m.series.map((s) => ({ v: s.expenses }))}
        />
        <HeroCard
          label="Activation rate"
          value={fmtPct(m.rate)}
          tone={m.rate >= m.expectedRate ? "green" : "amber"}
          icon={Target}
          sub={`Target ${m.expectedRate.toFixed(1)}%`}
          data={m.series.map((s) => ({ v: s.received ? (s.activated / s.received) * 100 : 0 }))}
        />
      </section>

      {/* Business engine */}
      <section className="mb-10">
        <SectionTitle eyebrow="Business engine" title="Three pillars driving the month" />
        <div className="grid gap-4 lg:grid-cols-3">
          <EngineBlock title="Acquisition" accent="blue" icon={Users}>
            <Mini label="Leads received" value={String(m.received)} data={m.series.map((s) => ({ v: s.received }))} tone="blue" />
            <Mini label="Conversion rate" value={fmtPct(m.rate)} tone="blue"
                  data={m.series.map((s) => ({ v: s.received ? (s.activated / s.received) * 100 : 0 }))} />
            <Mini
              label={m.activationSurplus >= 0 ? "Activation surplus" : "Activation deficit"}
              value={`${m.activationSurplus >= 0 ? "+" : ""}${Math.round(m.activationSurplus)}`}
              tone={m.activationSurplus >= 0 ? "green" : "red"}
              data={m.series.map((s) => ({ v: s.activated }))}
            />
          </EngineBlock>

          <EngineBlock title="Profitability" accent="green" icon={TrendingUp}>
            <Mini label="Net profit" value={fmtMoney(m.profit)} tone={m.profit >= 0 ? "green" : "red"}
                  data={m.series.map((s) => ({ v: s.profit }))} />
            <Mini label="CPA savings" value={fmtMoney(m.cpaSavings)} tone="purple"
                  data={m.series.map((s) => ({ v: s.activated - (s.received ? 0 : 0) }))} />
            <Mini label="ROI" value={`${m.roi.toFixed(1)}%`} tone={m.roi >= 0 ? "green" : "red"}
                  data={m.series.map((s) => ({ v: s.revenue - s.expenses }))} />
          </EngineBlock>

          <EngineBlock title="Operations" accent="amber" icon={Wallet}>
            <Mini label="Fixed monthly" value={fmtMoney(m.fixedMonthly)} tone="amber"
                  data={Array.from({ length: 12 }, (_, i) => ({ v: m.fixedMonthly * (0.92 + (i % 4) * 0.03) }))} />
            <Mini label="Recurring monthly" value={fmtMoney(m.recurringMonthly)} tone="amber"
                  data={Array.from({ length: 12 }, (_, i) => ({ v: m.recurringMonthly * (0.95 + (i % 3) * 0.03) }))} />
            <Mini label="Break-even revenue" value={fmtMoney(m.breakEven)}
                  tone={m.income >= m.breakEven ? "green" : "red"}
                  data={m.series.map((s) => ({ v: s.revenue }))} />
          </EngineBlock>
        </div>
      </section>

      {/* Charts */}
      <section className="mb-10 grid gap-4 lg:grid-cols-3">
        <div className="glass-surface glass-hover p-5 lg:col-span-2">
          <ChartHeader title="Revenue vs expenses" subtitle={rangeLabel} icon={Activity} />
          <div className="h-64 mt-2">
            <ResponsiveContainer>
              <AreaChart data={m.series} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.75 0.17 250)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.75 0.17 250)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.22 25)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.7 0.22 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.7 0.02 260)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "oklch(0.7 0.02 260)", fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<DarkTooltip money />} />
                <Area type="monotone" dataKey="revenue" stroke="oklch(0.78 0.17 250)" fill="url(#gRev)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="oklch(0.72 0.22 25)" fill="url(#gExp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-surface glass-hover p-5">
          <ChartHeader title="Lead funnel" subtitle={rangeLabel} icon={Zap} />
          <div className="mt-4 space-y-3">
            <FunnelStep label="Received" value={m.received} max={m.received} tone="blue" />
            <FunnelStep label="Activated" value={m.activated} max={m.received} tone="green" />
            <FunnelStep label="Reported" value={m.reported} max={m.received} tone="purple" />
            <FunnelStep label="Unreported" value={m.unreported} max={m.received} tone="amber" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <Pill label="CPA savings" tone="purple" value={fmtMoney(m.cpaSavings)} />
            <Pill label="Activation rate" tone="green" value={fmtPct(m.rate)} />
          </div>
        </div>
      </section>

      <section className="mb-10 grid gap-4 lg:grid-cols-3">
        <div className="glass-surface glass-hover p-5 lg:col-span-2">
          <ChartHeader title="Lead source performance" subtitle={`Activated vs received — ${rangeLabel.toLowerCase()}`} icon={Users} />
          <div className="h-64 mt-2">
            {m.sourceRows.length ? (
              <ResponsiveContainer>
                <BarChart data={m.sourceRows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "oklch(0.7 0.02 260)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "oklch(0.7 0.02 260)", fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip content={<DarkTooltip />} />
                  <Bar dataKey="received" fill="oklch(0.7 0.17 250 / 0.55)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="activated" fill="oklch(0.72 0.18 160)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No source data this month yet." />
            )}
          </div>
        </div>

        <AIInsights insights={insights} />
      </section>

      {/* Secondary detail */}
      <section className="glass-surface p-5">
        <ChartHeader title="Expense breakdown" subtitle="Where the money went" icon={Repeat} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <Row label="Lead cost" value={fmtMoney(m.leadCost)} />
          <Row label="Other expenses" value={fmtMoney(m.otherExp)} />
          <Row label="Salaries" value={fmtMoney(m.salaries)} />
          <Row label="Commissions" value={fmtMoney(m.commissions)} />
          <Row label="Upcoming (30d)" value={fmtMoney(m.upcoming30)} icon={CalendarClock} />
          <Row label="CPL costs" value={fmtMoney(m.cplCost)} />
          <Row label="CPA payable" value={fmtMoney(m.cpaPayable)} />
          <Row label="CPA savings" value={fmtMoney(m.cpaSavings)} accent="purple" />
        </div>
      </section>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</div>
      <h2 className="font-display text-xl font-semibold tracking-tight mt-1">{title}</h2>
    </div>
  );
}

function HeroCard({
  label, value, sub, tone, icon: Icon, data, primary,
}: {
  label: string; value: string; sub?: string; tone: Tone;
  icon: typeof DollarSign; data: { v: number }[]; primary?: boolean;
}) {
  const t = toneStyles[tone];
  return (
    <div className={cn("glass-surface glass-hover p-5 flex flex-col gap-3 overflow-hidden relative", t.glow, primary && "md:col-span-2 xl:col-span-1")}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", t.ring)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={cn("font-display text-3xl sm:text-4xl font-semibold tracking-tight", t.text)}>{value}</div>
      <div className="h-12 -mx-1">
        <Sparkline data={data} tone={tone} />
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function EngineBlock({ title, accent, icon: Icon, children }: { title: string; accent: Tone; icon: typeof Users; children: ReactNode }) {
  const t = toneStyles[accent];
  return (
    <div className="glass-surface glass-hover p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
        <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", t.ring)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function Mini({ label, value, tone, data }: { label: string; value: string; tone: Tone; data: { v: number }[] }) {
  const t = toneStyles[tone];
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex items-center gap-3 transition hover:bg-white/[0.04]">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className={cn("font-display text-lg font-semibold mt-0.5", t.text)}>{value}</div>
      </div>
      <div className="h-10 w-20 shrink-0">
        <Sparkline data={data} tone={tone} thin />
      </div>
    </div>
  );
}

function Sparkline({ data, tone, thin }: { data: { v: number }[]; tone: Tone; thin?: boolean }) {
  const t = toneStyles[tone];
  if (!data.length || data.every((d) => !d.v)) {
    return <div className="h-full w-full rounded bg-gradient-to-t from-white/[0.03] to-transparent" />;
  }
  const id = `spk-${tone}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.stroke} stopOpacity={0.5} />
            <stop offset="100%" stopColor={t.stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={t.stroke} strokeWidth={thin ? 1.5 : 2} fill={`url(#${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function FunnelStep({ label, value, max, tone }: { label: string; value: number; max: number; tone: Tone }) {
  const t = toneStyles[tone];
  const pct = max > 0 ? Math.max(2, (Math.abs(value) / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium tabular-nums", t.text)}>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${t.stroke}, ${t.fill})` }} />
      </div>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const t = toneStyles[tone];
  return (
    <div className={cn("rounded-md px-3 py-2 border border-white/5", t.ring.replace("text-", "bg-").split(" ")[0])}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-display text-sm font-semibold mt-0.5", t.text)}>{value}</div>
    </div>
  );
}

function ChartHeader({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon: typeof Activity }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

function DarkTooltip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[oklch(0.18_0.018_260)]/95 backdrop-blur px-3 py-2 text-xs shadow-2xl">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke }} />
          <span className="text-foreground capitalize">{p.dataKey}</span>
          <span className="ml-auto font-medium tabular-nums">
            {money ? fmtMoney(p.value) : Number(p.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">{text}</div>;
}

function Row({ label, value, icon: Icon, accent }: { label: string; value: string; icon?: typeof CalendarClock; accent?: Tone }) {
  const t = accent ? toneStyles[accent] : null;
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}{label}
      </div>
      <div className={cn("font-display text-lg font-semibold mt-1", t?.text)}>{value}</div>
    </div>
  );
}

// ---------- AI Insights ----------

type LocalInsight = { id: string; title: string; detail: string; tone: Tone; icon: typeof Sparkles };

function buildInsights(m: any): LocalInsight[] {
  const out: LocalInsight[] = [];

  if (m.profit > 0) {
    out.push({
      id: "profit", icon: TrendingUp, tone: "green",
      title: `You're profitable — ${fmtMoney(m.profit)} so far`,
      detail: `ROI ${m.roi.toFixed(1)}%. Keep current spend rhythm to stay in the green.`,
    });
  } else if (m.expTotal > 0) {
    out.push({
      id: "loss", icon: TrendingDown, tone: "red",
      title: `Operating at a loss of ${fmtMoney(Math.abs(m.profit))}`,
      detail: `Revenue needs to reach ${fmtMoney(m.expTotal)} this month to break even.`,
    });
  }

  if (m.cpaSavings > 0) {
    out.push({
      id: "savings", icon: Sparkles, tone: "purple",
      title: `${fmtMoney(m.cpaSavings)} saved via unreported activations`,
      detail: `${m.unreported} activations weren't billed by your CPA sources — pure margin.`,
    });
  }

  if (m.received > 0) {
    if (m.rate >= m.expectedRate) {
      out.push({
        id: "rate-up", icon: Target, tone: "green",
        title: `Conversion ${(m.rate - m.expectedRate).toFixed(1)} pts above target`,
        detail: `Running at ${m.rate.toFixed(1)}% vs. ${m.expectedRate.toFixed(1)}% expected — scale winning sources.`,
      });
    } else {
      out.push({
        id: "rate-down", icon: Target, tone: "amber",
        title: `Conversion ${(m.expectedRate - m.rate).toFixed(1)} pts below target`,
        detail: `Activation rate ${m.rate.toFixed(1)}% vs. target ${m.expectedRate.toFixed(1)}%. Review under-performing sources.`,
      });
    }
  }

  if (m.income > 0 && m.fixedMonthly > 0) {
    const cover = (m.income / m.fixedMonthly) * 100;
    out.push({
      id: "fixed", icon: Wallet, tone: cover >= 100 ? "green" : "amber",
      title: cover >= 100 ? `Fixed costs fully covered` : `Fixed costs ${cover.toFixed(0)}% covered`,
      detail: `Revenue ${fmtMoney(m.income)} against ${fmtMoney(m.fixedMonthly)} in fixed monthly costs.`,
    });
  }

  if (m.sourceRows?.length) {
    const top = m.sourceRows[0];
    out.push({
      id: "top-src", icon: Zap, tone: "blue",
      title: `Top source: ${top.name}`,
      detail: `${top.activated} activations from ${top.received} leads (${top.rate.toFixed(1)}%). Consider increasing budget.`,
    });
  }

  if (!out.length) {
    out.push({
      id: "empty", icon: Sparkles, tone: "neutral",
      title: "Add a few entries to unlock insights",
      detail: "Log leads, revenue and expenses to start seeing automated business signals here.",
    });
  }

  return out.slice(0, 5);
}

function AIInsights({ insights }: { insights: LocalInsight[] }) {
  return (
    <div className="glass-surface glass-hover p-5 glow-purple">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-300" /> AI insights
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Generated from your live data</p>
        </div>
      </div>
      <ul className="space-y-3">
        {insights.map((i) => {
          const t = toneStyles[i.tone];
          const Icon = i.icon;
          return (
            <li key={i.id} className="group flex gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:bg-white/[0.05] hover:-translate-y-0.5">
              <div className={cn("h-8 w-8 rounded-lg shrink-0 flex items-center justify-center", t.ring)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className={cn("text-sm font-medium leading-snug", t.text)}>{i.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{i.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// unused imports kept tree-shake friendly
void LineChart; void Line;
