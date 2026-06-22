import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign, TrendingDown, TrendingUp, Users, Target, Percent, Coins, Trophy, Award,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPct } from "@/lib/format";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Ledgerly" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [range, setRange] = useState<RangeKey>("month");
  const { start, end, label } = getRange(range);
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const leadsQ = useQuery({
    queryKey: ["leads", startISO, endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,cost,status,employee_id,source_id,created_at")
        .gte("created_at", startISO).lte("created_at", endISO);
      if (error) throw error;
      return data ?? [];
    },
  });
  const revQ = useQuery({
    queryKey: ["revenue", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue")
        .select("id,amount,date,employee_id,lead_id")
        .gte("date", startDate).lte("date", endDate);
      if (error) throw error;
      return data ?? [];
    },
  });
  const expQ = useQuery({
    queryKey: ["expenses", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id,amount,date,category_id")
        .gte("date", startDate).lte("date", endDate);
      if (error) throw error;
      return data ?? [];
    },
  });
  const empQ = useQuery({
    queryKey: ["employees-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id,name");
      return data ?? [];
    },
  });
  const srcQ = useQuery({
    queryKey: ["sources-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("lead_sources").select("id,name");
      return data ?? [];
    },
  });

  const m = useMemo(() => {
    const leads = leadsQ.data ?? [];
    const revenue = revQ.data ?? [];
    const expenses = expQ.data ?? [];
    const revTotal = revenue.reduce((s, r) => s + Number(r.amount), 0);
    const expTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalLeads = leads.length;
    const activated = leads.filter((l) => l.status === "activated").length;
    const leadCost = leads.reduce((s, l) => s + Number(l.cost), 0);
    return {
      revTotal, expTotal,
      profit: revTotal - expTotal,
      totalLeads, activated,
      activationRate: totalLeads ? (activated / totalLeads) * 100 : 0,
      cpl: totalLeads ? leadCost / totalLeads : 0,
      cpal: activated ? leadCost / activated : 0,
      revPerActivated: activated ? revTotal / activated : 0,
    };
  }, [leadsQ.data, revQ.data, expQ.data]);

  // Today specific
  const today = new Date().toISOString().slice(0, 10);
  const todayQ = useQuery({
    queryKey: ["today-summary", today],
    queryFn: async () => {
      const [rev, exp, leadsToday] = await Promise.all([
        supabase.from("revenue").select("amount,employee_id").eq("date", today),
        supabase.from("expenses").select("amount").eq("date", today),
        supabase.from("leads").select("status,source_id").gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`),
      ]);
      return { rev: rev.data ?? [], exp: exp.data ?? [], leads: leadsToday.data ?? [] };
    },
  });

  const td = useMemo(() => {
    if (!todayQ.data) return null;
    const empMap = new Map(empQ.data?.map((e) => [e.id, e.name]) ?? []);
    const srcMap = new Map(srcQ.data?.map((s) => [s.id, s.name]) ?? []);
    const revToday = todayQ.data.rev.reduce((s, r) => s + Number(r.amount), 0);
    const expToday = todayQ.data.exp.reduce((s, e) => s + Number(e.amount), 0);
    const leadsToday = todayQ.data.leads.length;
    const actToday = todayQ.data.leads.filter((l) => l.status === "activated").length;
    const empRev = new Map<string, number>();
    todayQ.data.rev.forEach((r) => {
      if (!r.employee_id) return;
      empRev.set(r.employee_id, (empRev.get(r.employee_id) ?? 0) + Number(r.amount));
    });
    const topEmp = [...empRev.entries()].sort((a, b) => b[1] - a[1])[0];
    const srcCount = new Map<string, number>();
    todayQ.data.leads.forEach((l) => {
      if (!l.source_id) return;
      srcCount.set(l.source_id, (srcCount.get(l.source_id) ?? 0) + 1);
    });
    const topSrc = [...srcCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      revToday, expToday, profitToday: revToday - expToday, leadsToday, actToday,
      topEmp: topEmp ? `${empMap.get(topEmp[0]) ?? "Unknown"} · ${fmtMoney(topEmp[1])}` : "—",
      topSrc: topSrc ? `${srcMap.get(topSrc[0]) ?? "Unknown"} · ${topSrc[1]} leads` : "—",
    };
  }, [todayQ.data, empQ.data, srcQ.data]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Executive view for ${label.toLowerCase()}.`}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total revenue" value={fmtMoney(m.revTotal)} icon={DollarSign} tone="positive" />
        <StatCard label="Total expenses" value={fmtMoney(m.expTotal)} icon={TrendingDown} />
        <StatCard label="Net profit" value={fmtMoney(m.profit)} icon={TrendingUp} tone={m.profit >= 0 ? "positive" : "negative"} />
        <StatCard label="Total leads" value={String(m.totalLeads)} icon={Users} />
        <StatCard label="Activated leads" value={String(m.activated)} icon={Target} />
        <StatCard label="Activation rate" value={fmtPct(m.activationRate)} icon={Percent} />
        <StatCard label="Cost per lead" value={fmtMoney(m.cpl)} icon={Coins} />
        <StatCard label="Cost per activation" value={fmtMoney(m.cpal)} icon={Coins} />
      </section>

      <section className="mt-6">
        <div className="card-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-base font-semibold">Today's executive summary</h3>
              <p className="text-xs text-muted-foreground">A snapshot of what happened today.</p>
            </div>
          </div>
          {td ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <MiniStat label="Revenue" value={fmtMoney(td.revToday)} />
              <MiniStat label="Expenses" value={fmtMoney(td.expToday)} />
              <MiniStat label="Profit" value={fmtMoney(td.profitToday)} accent={td.profitToday >= 0 ? "primary" : "destructive"} />
              <MiniStat label="Leads" value={String(td.leadsToday)} />
              <MiniStat label="Activated" value={String(td.actToday)} />
              <MiniStat label="Top closer" value={td.topEmp} icon={Trophy} />
              <MiniStat label="Top source" value={td.topSrc} icon={Award} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
        </div>
      </section>

      <section className="mt-6">
        <div className="card-surface p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Revenue per activated lead</div>
          <div className="font-display text-2xl font-semibold">{fmtMoney(m.revPerActivated)}</div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({
  label, value, accent, icon: Icon,
}: { label: string; value: string; accent?: "primary" | "destructive"; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md border border-border p-3 bg-card/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className={`mt-1 font-display text-base font-semibold ${accent === "primary" ? "text-primary" : accent === "destructive" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
