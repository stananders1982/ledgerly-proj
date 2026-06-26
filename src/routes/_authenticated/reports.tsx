import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, FileText, Printer, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TargetBadge } from "@/routes/_authenticated/sources";
import { exportCSV, exportPDF, exportXLSX } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Ledgerly" }] }),
  component: ReportsPage,
});

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "lastMonth" | "custom";
const iso = (d: Date) => d.toISOString().slice(0, 10);

function computeRange(key: RangeKey, customStart: string, customEnd: string) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today": return { start: iso(t), end: iso(t) };
    case "yesterday": { const y = new Date(t); y.setDate(y.getDate() - 1); return { start: iso(y), end: iso(y) }; }
    case "7d": { const s = new Date(t); s.setDate(s.getDate() - 6); return { start: iso(s), end: iso(t) }; }
    case "30d": { const s = new Date(t); s.setDate(s.getDate() - 29); return { start: iso(s), end: iso(t) }; }
    case "month": return { start: iso(new Date(t.getFullYear(), t.getMonth(), 1)), end: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
    case "lastMonth": return { start: iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), end: iso(new Date(t.getFullYear(), t.getMonth(), 0)) };
    case "custom": return { start: customStart || iso(t), end: customEnd || iso(t) };
  }
}

function monthlyEquiv(amount: number, freq: string) {
  return freq === "weekly" ? (amount * 52) / 12 : freq === "quarterly" ? amount / 3 : freq === "yearly" ? amount / 12 : amount;
}

function ReportsPage() {
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [tab, setTab] = useState("summary");
  const [pvPeriod, setPvPeriod] = useState<"week" | "month" | "all">("month");
  const { start, end } = useMemo(() => computeRange(range, customStart, customEnd), [range, customStart, customEnd]);
  const pvWindow = useMemo(() => {
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (pvPeriod === "all") return { start: "1900-01-01", end: "2999-12-31" };
    if (pvPeriod === "week") {
      const day = t.getDay();
      const diff = (day + 6) % 7;
      const s = new Date(t); s.setDate(s.getDate() - diff);
      const e = new Date(s); e.setDate(e.getDate() + 6);
      return { start: iso(s), end: iso(e) };
    }
    return { start: iso(new Date(t.getFullYear(), t.getMonth(), 1)), end: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
  }, [pvPeriod]);


  const leadsQ = useQuery({
    queryKey: ["rpt-leads", start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_entries")
        .select("entry_date,source_id,campaign,received,activated,reported,converted,cost,notes,lead_sources(id,name,pricing_model,price)")
        .gte("entry_date", start).lte("entry_date", end);
      if (error) throw error;
      return data ?? [];
    },
  });
  const revQ = useQuery({
    queryKey: ["rpt-rev", start, end],
    queryFn: async () => (await supabase.from("revenue").select("id,date,amount,customer_name,employee_id,employee_id_2,split_pct,lead_id,notes,created_at,employees:employee_id(name),employee2:employee_id_2(name)").gte("date", start).lte("date", end)).data ?? [],
  });
  const expQ = useQuery({
    queryKey: ["rpt-exp", start, end],
    queryFn: async () => (await supabase.from("expenses").select("id,date,amount,notes,category_id,created_at,expense_categories(name)").gte("date", start).lte("date", end)).data ?? [],
  });
  const empQ = useQuery({
    queryKey: ["rpt-emp"],
    queryFn: async () => (await supabase.from("employees").select("id,name,salary,commission_pct,active,role,updated_at,created_at")).data ?? [],
  });
  const recQ = useQuery({
    queryKey: ["rpt-recurring"],
    queryFn: async () => (await supabase.from("recurring_expenses").select("id,name,amount,frequency,next_due_date,end_date,active,expense_categories(name)").eq("active", true)).data ?? [],
  });
  const srcQ = useQuery({
    queryKey: ["rpt-sources"],
    queryFn: async () => (await supabase.from("lead_sources").select("id,name,pricing_model,price,expected_conversion_rate")).data ?? [],
  });
  const attQ = useQuery({
    queryKey: ["rpt-attendance", start, end],
    queryFn: async () => (await supabase.from("attendance").select("employee_id,date,present").gte("date", start).lte("date", end)).data ?? [],
  });
  const pvLeadsQ = useQuery({
    queryKey: ["pv-entries", pvWindow.start, pvWindow.end],
    queryFn: async () => (await supabase
      .from("daily_lead_entries")
      .select("source_id,activated,entry_date,lead_sources(id,name)")
      .gte("entry_date", pvWindow.start)
      .lte("entry_date", pvWindow.end)).data ?? [],
  });
  const pvRevQ = useQuery({
    queryKey: ["pv-rev", pvWindow.start, pvWindow.end],
    queryFn: async () => (await supabase
      .from("revenue")
      .select("id,amount,date,affiliate_id,employee_id,employee_id_2,split_pct,lead_id,leads(affiliate_id)")
      .gte("date", pvWindow.start)
      .lte("date", pvWindow.end)).data ?? [],
  });
  const affMapQ = useQuery({
    queryKey: ["pv-affs"],
    queryFn: async () => (await supabase.from("affiliates").select("id,name")).data ?? [],
  });




  const data = useMemo(() => {
    const entries = (leadsQ.data ?? []) as any[];
    const revenue = (revQ.data ?? []) as any[];
    const expenses = (expQ.data ?? []) as any[];
    const employees = (empQ.data ?? []) as any[];
    const recurring = (recQ.data ?? []) as any[];

    let received = 0, activated = 0, reported = 0, converted = 0;
    let cplCost = 0, cpaPayable = 0, cpaSavings = 0, marketingCost = 0;
    for (const e of entries) {
      received += e.received ?? 0;
      activated += e.activated ?? 0;
      reported += e.reported ?? 0;
      converted += e.converted ?? 0;
      marketingCost += Number(e.cost ?? 0);
      const s = e.lead_sources;
      if (!s) continue;
      const p = Number(s.price);
      if (s.pricing_model === "CPL") cplCost += p * (e.received ?? 0);
      else {
        cpaPayable += p * (e.reported ?? 0);
        cpaSavings += p * Math.max(0, (e.activated ?? 0) - (e.reported ?? 0));
      }
    }
    const unreported = activated - reported;
    const income = revenue.reduce((s, r) => s + Number(r.amount), 0);
    const otherExp = expenses.reduce((s, r) => s + Number(r.amount), 0);
    const activeEmp = employees.filter((e) => e.active);
    const salaries = activeEmp.reduce((s, e) => s + Number(e.salary), 0);
    const commissions = activeEmp.reduce((s, e) => s + (income * Number(e.commission_pct)) / 100, 0);
    const leadCost = cplCost + cpaPayable;
    const totalExpenses = leadCost + marketingCost + otherExp + salaries + commissions;
    const profit = income - totalExpenses;

    return {
      received, activated, reported, unreported, converted,
      cplCost, cpaPayable, cpaSavings, marketingCost, leadCost,
      income, otherExp, salaries, commissions, totalExpenses, profit,
      rate: received ? (activated / received) * 100 : 0,
      cpl: received ? leadCost / received : 0,
      cpa: activated ? leadCost / activated : 0,
      revPerActivation: activated ? income / activated : 0,
      margin: income ? (profit / income) * 100 : 0,
      entries, revenue, expenses, employees, recurring,
    };
  }, [leadsQ.data, revQ.data, expQ.data, empQ.data, recQ.data]);

  const sources = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of (srcQ.data ?? []) as any[]) map.set(s.id, { id: s.id, name: s.name, model: s.pricing_model, price: Number(s.price), expected: Number(s.expected_conversion_rate) || 0, leads: 0, activated: 0, reported: 0, marketing: 0 });
    for (const e of data.entries) {
      if (!e.source_id) continue;
      const r = map.get(e.source_id); if (!r) continue;
      r.leads += e.received ?? 0; r.activated += e.activated ?? 0; r.reported += e.reported ?? 0; r.marketing += Number(e.cost ?? 0);
    }
    const revPerActivation = data.revPerActivation;
    return Array.from(map.values()).map((r) => {
      const cost = r.model === "CPL" ? r.price * r.leads : r.price * r.reported;
      const savings = r.model === "CPA" ? r.price * Math.max(0, r.activated - r.reported) : 0;
      const revenue = r.activated * revPerActivation;
      const totalCost = cost + r.marketing;
      const actualRate = r.leads ? (r.activated / r.leads) * 100 : 0;
      const expectedActivations = (r.leads * r.expected) / 100;
      return { ...r, cost, savings, revenue, totalCost,
        rate: actualRate,
        actualRate,
        variance: actualRate - r.expected,
        expectedActivations,
        deficit: r.activated - expectedActivations,
        status: r.expected ? (actualRate >= r.expected ? "Above" : "Below") : "—",
        roi: totalCost ? ((revenue - totalCost) / totalCost) * 100 : 0,
        cpl: r.leads ? totalCost / r.leads : 0,
        cpaEff: r.activated ? totalCost / r.activated : 0,
      };
    });
  }, [srcQ.data, data.entries, data.revPerActivation]);

  const affiliatePayouts = useMemo(() => {
    const affs = (affMapQ.data ?? []) as any[];
    const affByLowerName = new Map<string, { id: string; name: string }>(
      affs.map((a) => [String(a.name).trim().toLowerCase(), { id: a.id, name: a.name }])
    );
    type Row = { affiliateId: string; affiliateName: string; month: string; model: string; received: number; activated: number; reported: number; cost: number; savings: number };
    const byKey = new Map<string, Row>();
    const byAff = new Map<string, { id: string; name: string; received: number; activated: number; reported: number; cost: number; savings: number }>();
    for (const e of data.entries) {
      const s = e.lead_sources;
      if (!s) continue;
      const aff = affByLowerName.get(String(s.name).trim().toLowerCase());
      if (!aff) continue;
      const month = String(e.entry_date).slice(0, 7);
      const price = Number(s.price);
      const received = e.received ?? 0;
      const activated = e.activated ?? 0;
      const reported = e.reported ?? 0;
      const cost = s.pricing_model === "CPL" ? price * received : price * reported;
      const savings = s.pricing_model === "CPA" ? price * Math.max(0, activated - reported) : 0;
      const key = `${aff.id}|${month}`;
      const row = byKey.get(key) ?? { affiliateId: aff.id, affiliateName: aff.name, month, model: s.pricing_model, received: 0, activated: 0, reported: 0, cost: 0, savings: 0 };
      row.received += received; row.activated += activated; row.reported += reported; row.cost += cost; row.savings += savings;
      byKey.set(key, row);
      const a = byAff.get(aff.id) ?? { id: aff.id, name: aff.name, received: 0, activated: 0, reported: 0, cost: 0, savings: 0 };
      a.received += received; a.activated += activated; a.reported += reported; a.cost += cost; a.savings += savings;
      byAff.set(aff.id, a);
    }
    const rows = Array.from(byKey.values()).sort((a, b) => b.month.localeCompare(a.month) || a.affiliateName.localeCompare(b.affiliateName));
    const totals = Array.from(byAff.values()).sort((a, b) => b.cost - a.cost);
    const totalCost = totals.reduce((s, x) => s + x.cost, 0);
    const totalSavings = totals.reduce((s, x) => s + x.savings, 0);
    return { rows, totals, totalCost, totalSavings };
  }, [data.entries, affMapQ.data]);

  const employeesRpt = useMemo(() => {
    const rev = data.revenue;
    const byEmp = new Map<string, { name: string; revenue: number; leads: number; activated: number; salary: number; commissionPct: number }>();
    for (const e of data.employees) byEmp.set(e.id, { name: e.name, revenue: 0, leads: 0, activated: 0, salary: Number(e.salary), commissionPct: Number(e.commission_pct) });
    for (const r of rev) {
      const amt = Number(r.amount);
      const pct = Number(r.split_pct ?? 100);
      if (r.employee_id) {
        const x = byEmp.get(r.employee_id); if (x) x.revenue += amt * (pct / 100);
      }
      if (r.employee_id_2) {
        const x = byEmp.get(r.employee_id_2); if (x) x.revenue += amt * ((100 - pct) / 100);
      }
    }
    // No employee_id on daily_lead_entries; leave leads/activated as 0
    return Array.from(byEmp.values()).map((e) => {
      const commission = (e.revenue * e.commissionPct) / 100;
      return { ...e, commission, profit: e.revenue - commission - e.salary, rate: e.leads ? (e.activated / e.leads) * 100 : 0 };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [data.revenue, data.employees]);

  const playerValue = useMemo(() => {
    const entries = (pvLeadsQ.data ?? []) as any[];
    const rev = (pvRevQ.data ?? []) as any[];
    const affs = ((affMapQ.data ?? []) as any[]);
    const affNames = new Map<string, string>(affs.map((a) => [a.id, a.name]));
    const affByLowerName = new Map<string, string>(affs.map((a) => [String(a.name).trim().toLowerCase(), a.id]));
    const empNames = new Map<string, string>((data.employees as any[]).map((e) => [e.id, e.name]));
    type Row = { id: string; name: string; activated: number; revenue: number };
    const byAff = new Map<string, Row>();
    const byEmp = new Map<string, Row>();
    const getA = (id: string) => byAff.get(id) ?? { id, name: affNames.get(id) ?? "—", activated: 0, revenue: 0 };
    const getE = (id: string) => byEmp.get(id) ?? { id, name: empNames.get(id) ?? "—", activated: 0, revenue: 0 };
    // Activations per affiliate: from daily_lead_entries via source-name → affiliate-name match
    for (const e of entries) {
      const srcName = e.lead_sources?.name;
      if (!srcName) continue;
      const affId = affByLowerName.get(String(srcName).trim().toLowerCase());
      if (!affId) continue;
      const x = getA(affId); x.activated += Number(e.activated ?? 0); byAff.set(affId, x);
    }
    // Revenue per affiliate: prefer direct revenue.affiliate_id, fallback to leads.affiliate_id
    for (const r of rev) {
      const amt = Number(r.amount);
      const pct = Number(r.split_pct ?? 100);
      const affId = r.affiliate_id ?? r.leads?.affiliate_id;
      if (affId) { const x = getA(affId); x.revenue += amt; byAff.set(affId, x); }
      if (r.employee_id) { const x = getE(r.employee_id); x.revenue += amt * (pct / 100); byEmp.set(r.employee_id, x); }
      if (r.employee_id_2) { const x = getE(r.employee_id_2); x.revenue += amt * ((100 - pct) / 100); byEmp.set(r.employee_id_2, x); }
    }
    const toRows = (m: Map<string, Row>) => Array.from(m.values())
      .map((x) => ({ ...x, playerValue: x.activated ? x.revenue / x.activated : 0 }))
      .sort((a, b) => b.playerValue - a.playerValue);
    return { byAff: toRows(byAff), byEmp: toRows(byEmp) };
  }, [pvLeadsQ.data, pvRevQ.data, affMapQ.data, data.employees]);




  const recurringRpt = useMemo(() => {
    return data.recurring.map((r: any) => {
      const monthly = monthlyEquiv(Number(r.amount), r.frequency);
      return { name: r.name, frequency: r.frequency, monthly, yearly: monthly * 12, next_due_date: r.next_due_date, category: r.expense_categories?.name ?? "—" };
    });
  }, [data.recurring]);

  // Attendance report — working days (Mon–Fri) in selected range
  const attendanceRpt = useMemo(() => {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    let workingDays = 0;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const w = d.getDay();
      if (w !== 0 && w !== 6) workingDays++;
    }
    const records = (attQ.data ?? []) as { employee_id: string; date: string; present: boolean }[];
    const byEmp = new Map<string, { present: number; absent: number }>();
    for (const r of records) {
      const cur = byEmp.get(r.employee_id) ?? { present: 0, absent: 0 };
      if (r.present) cur.present++; else cur.absent++;
      byEmp.set(r.employee_id, cur);
    }
    const rows = data.employees
      .filter((e: any) => e.active)
      .map((e: any) => {
        const stat = byEmp.get(e.id) ?? { present: 0, absent: 0 };
        const marked = stat.present + stat.absent;
        const unmarked = Math.max(0, workingDays - marked);
        const salary = Number(e.salary);
        const perDay = workingDays > 0 ? salary / workingDays : 0;
        const deduction = perDay * stat.absent;
        const attendancePct = workingDays > 0 ? ((workingDays - stat.absent) / workingDays) * 100 : 0;
        return {
          name: e.name,
          salary,
          perDay,
          workingDays,
          present: stat.present,
          absent: stat.absent,
          unmarked,
          deduction,
          netPayable: salary - deduction,
          attendancePct,
        };
      })
      .sort((a, b) => b.absent - a.absent);
    const totals = rows.reduce(
      (acc, r) => ({
        salary: acc.salary + r.salary,
        absent: acc.absent + r.absent,
        deduction: acc.deduction + r.deduction,
        netPayable: acc.netPayable + r.netPayable,
      }),
      { salary: 0, absent: 0, deduction: 0, netPayable: 0 },
    );
    return { rows, totals, workingDays };
  }, [attQ.data, data.employees, start, end]);

  const recurringTotals = useMemo(() => {
    const monthly = recurringRpt.reduce((s, r) => s + r.monthly, 0);
    return { monthly, yearly: monthly * 12 };
  }, [recurringRpt]);

  // Activity feed (audit-lite) from created_at
  const activityQ = useQuery({
    queryKey: ["rpt-activity", start, end],
    queryFn: async () => {
      const sd = new Date(start + "T00:00:00").toISOString();
      const ed = new Date(end + "T23:59:59").toISOString();
      const [r, e, l, emp] = await Promise.all([
        supabase.from("revenue").select("id,amount,customer_name,created_at,updated_at").gte("created_at", sd).lte("created_at", ed),
        supabase.from("expenses").select("id,amount,notes,created_at,updated_at").gte("created_at", sd).lte("created_at", ed),
        supabase.from("daily_lead_entries").select("id,entry_date,received,activated,created_at,updated_at").gte("created_at", sd).lte("created_at", ed),
        supabase.from("employees").select("id,name,created_at,updated_at").gte("updated_at", sd).lte("updated_at", ed),
      ]);
      const items: any[] = [];
      (r.data ?? []).forEach((x) => items.push({ time: x.created_at, type: "Income added", detail: `${x.customer_name} — ${fmtMoney(Number(x.amount))}` }));
      (e.data ?? []).forEach((x) => items.push({ time: x.created_at, type: "Expense added", detail: `${x.notes ?? ""} — ${fmtMoney(Number(x.amount))}` }));
      (l.data ?? []).forEach((x) => items.push({ time: x.created_at, type: "Leads entry", detail: `${x.entry_date}: ${x.received} received / ${x.activated} activated` }));
      (emp.data ?? []).forEach((x) => items.push({ time: x.updated_at, type: x.created_at === x.updated_at ? "Employee created" : "Employee updated", detail: x.name }));
      items.sort((a, b) => +new Date(b.time) - +new Date(a.time));
      return items;
    },
  });

  // P&L category buckets
  const plCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data.expenses) {
      const k = (e as any).expense_categories?.name ?? "Uncategorized";
      map.set(k, (map.get(k) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).map(([name, amount]) => ({ name, amount }));
  }, [data.expenses]);

  // Forecast: scale month-to-date by month length
  const forecast = useMemo(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const factor = range === "month" && dayOfMonth > 0 ? totalDays / dayOfMonth : 1;
    return {
      revenue: data.income * factor,
      profit: data.profit * factor,
      cpaCost: data.cpaPayable * factor,
      savings: data.cpaSavings * factor,
      factor,
    };
  }, [data, range]);

  // Conversion funnel
  const funnel = useMemo(() => {
    const stages = [
      { name: "Leads received", value: data.received },
      { name: "Contacted", value: Math.round(data.received * 0.8) }, // estimated
      { name: "Qualified", value: Math.round(data.received * 0.5) },
      { name: "Activated", value: data.activated },
      { name: "Reported", value: data.reported },
    ];
    const max = stages[0].value || 1;
    return stages.map((s, i) => ({ ...s, pct: max ? (s.value / max) * 100 : 0, conv: i === 0 ? 100 : stages[i - 1].value ? (s.value / stages[i - 1].value) * 100 : 0 }));
  }, [data.received, data.activated, data.reported]);

  // Revenue groupings
  const revByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data.revenue) map.set(r.date, (map.get(r.date) ?? 0) + Number(r.amount));
    return Array.from(map.entries()).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));
  }, [data.revenue]);

  const expByCategory = plCategories;
  const expByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data.expenses) {
      const k = (e.date ?? "").slice(0, 7);
      map.set(k, (map.get(k) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month));
  }, [data.expenses]);

  // Export current tab
  function exportCurrent(format: "csv" | "xlsx" | "pdf") {
    const title = `Report — ${tab}`;
    const fn = `report-${tab}-${start}-to-${end}`;
    let rows: Record<string, unknown>[] = [];
    if (tab === "summary") {
      rows = [
        { Metric: "Revenue", Value: data.income },
        { Metric: "Expenses", Value: data.totalExpenses },
        { Metric: "Net Profit", Value: data.profit },
        { Metric: "Leads Received", Value: data.received },
        { Metric: "Activated", Value: data.activated },
        { Metric: "Reported", Value: data.reported },
        { Metric: "Unreported", Value: data.unreported },
        { Metric: "Activation Rate %", Value: data.rate.toFixed(1) },
        { Metric: "Cost Per Lead", Value: data.cpl.toFixed(2) },
        { Metric: "Cost Per Activation", Value: data.cpa.toFixed(2) },
        { Metric: "Revenue Per Activation", Value: data.revPerActivation.toFixed(2) },
        { Metric: "CPA Savings", Value: data.cpaSavings },
      ];
    } else if (tab === "pl") {
      rows = [
        { Line: "Revenue", Amount: data.income },
        { Line: "CPL Costs", Amount: data.cplCost },
        { Line: "CPA Costs", Amount: data.cpaPayable },
        { Line: "Marketing", Amount: data.marketingCost },
        { Line: "Salaries", Amount: data.salaries },
        { Line: "Commissions", Amount: data.commissions },
        ...plCategories.map((c) => ({ Line: c.name, Amount: c.amount })),
        { Line: "Total Expenses", Amount: data.totalExpenses },
        { Line: "Net Profit", Amount: data.profit },
        { Line: "Profit Margin %", Amount: data.margin.toFixed(1) },
      ];
    } else if (tab === "sources") rows = sources.map((s) => ({ Source: s.name, Model: s.model, Leads: s.leads, Activated: s.activated, Reported: s.reported, Rate: s.rate.toFixed(1), Revenue: s.revenue, Cost: s.totalCost, Savings: s.savings, ROI: s.roi.toFixed(1) }));
    else if (tab === "employees") rows = employeesRpt.map((e) => ({ Employee: e.name, Revenue: e.revenue, Commission: e.commission, Salary: e.salary, Profit: e.profit }));
    else if (tab === "savings") rows = sources.filter((s) => s.model === "CPA").map((s) => ({ Source: s.name, Activated: s.activated, Reported: s.reported, Unreported: s.activated - s.reported, Price: s.price, Savings: s.savings }));
    else if (tab === "marketing") rows = sources.map((s) => ({ Source: s.name, Spend: s.totalCost, Leads: s.leads, CPL: s.cpl.toFixed(2), Activated: s.activated, CPA: s.cpaEff.toFixed(2), Revenue: s.revenue, ROI: s.roi.toFixed(1) }));
    else if (tab === "expenses") rows = expByCategory.map((c) => ({ Category: c.name, Amount: c.amount, Percent: data.otherExp ? ((c.amount / data.otherExp) * 100).toFixed(1) : "0" }));
    else if (tab === "recurring") rows = recurringRpt.map((r) => ({ Expense: r.name, Frequency: r.frequency, Monthly: r.monthly, Yearly: r.yearly, NextDue: r.next_due_date }));
    else if (tab === "revenue") rows = revByDay.map((r) => ({ Date: r.date, Amount: r.amount }));
    else if (tab === "funnel") rows = funnel.map((f) => ({ Stage: f.name, Count: f.value, Conversion: f.conv.toFixed(1) + "%" }));
    else if (tab === "forecast") rows = [
      { Metric: "Projected Revenue", Value: forecast.revenue },
      { Metric: "Projected Profit", Value: forecast.profit },
      { Metric: "Projected CPA Costs", Value: forecast.cpaCost },
      { Metric: "Projected Savings", Value: forecast.savings },
    ];
    else if (tab === "audit") rows = (activityQ.data ?? []).map((a: any) => ({ Time: new Date(a.time).toLocaleString(), Type: a.type, Detail: a.detail }));
    else if (tab === "attendance") rows = attendanceRpt.rows.map((r) => ({ Employee: r.name, WorkingDays: r.workingDays, Present: r.present, Absent: r.absent, Unmarked: r.unmarked, AttendancePct: r.attendancePct.toFixed(1), Salary: r.salary, PerDay: r.perDay.toFixed(2), Deduction: r.deduction.toFixed(2), NetPayable: r.netPayable.toFixed(2) }));
    else if (tab === "playervalue") rows = [
      ...playerValue.byAff.map((r) => ({ Group: "Affiliate", Name: r.name, Activated: r.activated, Revenue: r.revenue, PlayerValue: r.playerValue.toFixed(2) })),
      ...playerValue.byEmp.map((r) => ({ Group: "Employee", Name: r.name, Activated: r.activated, Revenue: r.revenue, PlayerValue: r.playerValue.toFixed(2) })),
    ];


    if (format === "csv") exportCSV(rows, fn);
    if (format === "xlsx") exportXLSX(rows, fn);
    if (format === "pdf") exportPDF(title, rows, fn);
  }

  return (
    <div className="print:p-0">
      <PageHeader
        title="Report Center"
        description={`Period: ${start} → ${end}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => exportCurrent("pdf")}><FileText className="h-4 w-4 mr-1" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={() => exportCurrent("xlsx")}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportCurrent("csv")}><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3 mb-6 print:hidden">
        <div className="min-w-[180px]">
          <label className="text-xs text-muted-foreground">Date range</label>
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="lastMonth">Last month</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Start</label>
          <Input type="date" value={range === "custom" ? customStart : start} onChange={(e) => { setCustomStart(e.target.value); setCustomEnd((prev) => prev || end); setRange("custom"); }} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End</label>
          <Input type="date" value={range === "custom" ? customEnd : end} onChange={(e) => { setCustomEnd(e.target.value); setCustomStart((prev) => prev || start); setRange("custom"); }} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto print:hidden">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="summary">Executive</TabsTrigger>
            <TabsTrigger value="pl">P&amp;L</TabsTrigger>
            <TabsTrigger value="sources">Lead Sources</TabsTrigger>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="payouts">Affiliate Payouts</TabsTrigger>
            <TabsTrigger value="playervalue">Player Value</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="savings">CPA Savings</TabsTrigger>
            <TabsTrigger value="marketing">Marketing</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>
        </div>


        <TabsContent value="summary" className="space-y-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="Revenue" value={fmtMoney(data.income)} tone="positive" />
            <StatCard label="Expenses" value={fmtMoney(data.totalExpenses)} />
            <StatCard label="Net Profit" value={fmtMoney(data.profit)} tone={data.profit >= 0 ? "positive" : "negative"} />
            <StatCard label="Activation Rate" value={fmtPct(data.rate)} />
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="Leads Received" value={String(data.received)} />
            <StatCard label="Activated" value={String(data.activated)} />
            <StatCard label="Reported" value={String(data.reported)} />
            <StatCard label="Unreported" value={String(data.unreported)} />
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="Cost per Lead" value={fmtMoney(data.cpl)} />
            <StatCard label="Cost per Activation" value={fmtMoney(data.cpa)} />
            <StatCard label="Revenue per Activation" value={fmtMoney(data.revPerActivation)} />
            <StatCard label="CPA Savings" value={fmtMoney(data.cpaSavings)} tone="positive" />
          </div>
        </TabsContent>

        <TabsContent value="pl">
          <div className="card-surface p-5 space-y-4">
            <Section title="Revenue">
              <Line label="Total Revenue" value={fmtMoney(data.income)} bold />
            </Section>
            <Section title="Expenses">
              <Line label="Marketing" value={fmtMoney(data.marketingCost)} />
              <Line label="CPL Costs" value={fmtMoney(data.cplCost)} />
              <Line label="CPA Costs" value={fmtMoney(data.cpaPayable)} />
              <Line label="Salaries" value={fmtMoney(data.salaries)} />
              <Line label="Commissions" value={fmtMoney(data.commissions)} />
              {plCategories.map((c) => <Line key={c.name} label={c.name} value={fmtMoney(c.amount)} />)}
            </Section>
            <Section title="Totals">
              <Line label="Total Expenses" value={fmtMoney(data.totalExpenses)} bold />
              <Line label="Net Profit" value={fmtMoney(data.profit)} bold />
              <Line label="Profit Margin" value={fmtPct(data.margin)} bold />
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="sources">
          <SortableTable
            columns={[
              { key: "name", label: "Source" },
              { key: "model", label: "Model", render: (v) => <Badge variant={v === "CPL" ? "secondary" : "default"}>{v}</Badge> },
              { key: "leads", label: "Leads", numeric: true },
              { key: "activated", label: "Activated", numeric: true },
              { key: "reported", label: "Reported", numeric: true },
              { key: "expected", label: "Expected %", numeric: true, render: (v) => v ? fmtPct(v) : "—" },
              { key: "actualRate", label: "Actual %", numeric: true, render: (v) => fmtPct(v) },
              { key: "variance", label: "Variance", numeric: true, render: (v, r) => r.expected ? <span className={v >= 0 ? "text-emerald-500" : "text-destructive"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span> : "—" },
              { key: "deficit", label: "Surplus", numeric: true, render: (v, r) => r.expected ? <span className={v >= 0 ? "text-emerald-500" : "text-destructive"}>{v >= 0 ? "+" : ""}{Math.round(v)}</span> : "—" },
              { key: "status", label: "Status", render: (_v, r) => <TargetBadge actual={r.actualRate} expected={r.expected} /> },
              { key: "revenue", label: "Revenue", numeric: true, render: (v) => fmtMoney(v) },
              { key: "totalCost", label: "Cost", numeric: true, render: (v) => fmtMoney(v) },
              { key: "savings", label: "Savings", numeric: true, render: (v) => fmtMoney(v) },
              { key: "roi", label: "ROI", numeric: true, render: (v) => fmtPct(v) },
            ]}
            rows={sources}
            searchable
          />
        </TabsContent>


        <TabsContent value="employees">
          <SortableTable
            columns={[
              { key: "rank", label: "#" },
              { key: "name", label: "Employee" },
              { key: "revenue", label: "Revenue", numeric: true, render: (v) => fmtMoney(v) },
              { key: "commission", label: "Commission", numeric: true, render: (v) => fmtMoney(v) },
              { key: "salary", label: "Salary", numeric: true, render: (v) => fmtMoney(v) },
              { key: "profit", label: "Profit", numeric: true, render: (v) => fmtMoney(v) },
            ]}
            rows={employeesRpt.map((e, i) => ({ ...e, rank: i + 1 }))}
            searchable
          />
        </TabsContent>

        <TabsContent value="payouts">
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Paid to Affiliates" value={fmtMoney(affiliatePayouts.totalCost)} tone="negative" />
              <StatCard label="CPA Savings" value={fmtMoney(affiliatePayouts.totalSavings)} tone="positive" />
              <StatCard label="Affiliates" value={String(affiliatePayouts.totals.length)} />
              <StatCard label="Range" value={`${start} → ${end}`} />
            </div>

            <div>
              <h3 className="font-display font-semibold mb-2">Totals by Affiliate</h3>
              <SortableTable
                columns={[
                  { key: "name", label: "Affiliate" },
                  { key: "received", label: "Leads", numeric: true },
                  { key: "activated", label: "Activated", numeric: true },
                  { key: "reported", label: "Reported", numeric: true },
                  { key: "savings", label: "Savings", numeric: true, render: (v) => fmtMoney(v) },
                  { key: "cost", label: "Paid", numeric: true, render: (v) => fmtMoney(v) },
                ]}
                rows={affiliatePayouts.totals}
              />
            </div>

            <div>
              <h3 className="font-display font-semibold mb-2">Monthly breakdown</h3>
              <SortableTable
                columns={[
                  { key: "month", label: "Month" },
                  { key: "affiliateName", label: "Affiliate" },
                  { key: "model", label: "Model", render: (v) => <Badge variant="outline">{String(v)}</Badge> },
                  { key: "received", label: "Leads", numeric: true },
                  { key: "activated", label: "Activated", numeric: true },
                  { key: "reported", label: "Reported", numeric: true },
                  { key: "savings", label: "Savings", numeric: true, render: (v) => fmtMoney(v) },
                  { key: "cost", label: "Paid", numeric: true, render: (v) => fmtMoney(v) },
                ]}
                rows={affiliatePayouts.rows}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Payout = (CPL: Leads × Price) or (CPA: Reported × Price). Affiliates are matched to lead sources by name.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="playervalue">
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="min-w-[180px]">
                <label className="text-xs text-muted-foreground">Period</label>
                <Select value={pvPeriod} onValueChange={(v) => setPvPeriod(v as "week" | "month" | "all")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="month">This month</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground pb-2">
                Window: {pvPeriod === "all" ? "All time" : `${pvWindow.start} → ${pvWindow.end}`}
                <span className="ml-2">Player Value = Revenue ÷ Activated leads.</span>
              </div>
            </div>

            <div>
              <h3 className="font-display font-semibold mb-2">By Affiliate</h3>
              <SortableTable
                columns={[
                  { key: "name", label: "Affiliate" },
                  { key: "activated", label: "Activated", numeric: true },
                  { key: "revenue", label: "Revenue", numeric: true, render: (v) => fmtMoney(v) },
                  { key: "playerValue", label: "Player Value", numeric: true, render: (v) => fmtMoney(v) },
                ]}
                rows={playerValue.byAff}
              />
            </div>

            <div>
              <h3 className="font-display font-semibold mb-2">By Employee</h3>
              <SortableTable
                columns={[
                  { key: "name", label: "Employee" },
                  { key: "activated", label: "Activated", numeric: true },
                  { key: "revenue", label: "Revenue", numeric: true, render: (v) => fmtMoney(v) },
                  { key: "playerValue", label: "Player Value", numeric: true, render: (v) => fmtMoney(v) },
                ]}
                rows={playerValue.byEmp}
              />
            </div>
          </div>
        </TabsContent>



        <TabsContent value="attendance">
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard label="Working Days" value={String(attendanceRpt.workingDays)} />
              <StatCard label="Total Absences" value={String(attendanceRpt.totals.absent)} />
              <StatCard label="Total Deductions" value={fmtMoney(attendanceRpt.totals.deduction)} tone="negative" />
              <StatCard label="Net Payable" value={fmtMoney(attendanceRpt.totals.netPayable)} tone="positive" />
            </div>
            <SortableTable
              columns={[
                { key: "name", label: "Employee" },
                { key: "workingDays", label: "Working Days", numeric: true },
                { key: "present", label: "Present", numeric: true },
                { key: "absent", label: "Absent", numeric: true, render: (v) => <span className={v > 0 ? "text-rose-500" : ""}>{v}</span> },
                { key: "unmarked", label: "Unmarked", numeric: true },
                { key: "attendancePct", label: "Attendance", numeric: true, render: (v) => fmtPct(v) },
                { key: "salary", label: "Salary", numeric: true, render: (v) => fmtMoney(v) },
                { key: "perDay", label: "Per Day", numeric: true, render: (v) => fmtMoney(v) },
                { key: "deduction", label: "Deduction", numeric: true, render: (v) => <span className={v > 0 ? "text-rose-500" : ""}>{v > 0 ? "−" : ""}{fmtMoney(v)}</span> },
                { key: "netPayable", label: "Net Payable", numeric: true, render: (v) => fmtMoney(v) },
              ]}
              rows={attendanceRpt.rows}
              searchable
            />
            <p className="text-xs text-muted-foreground">Working days count Mon–Fri within the selected range. Deduction = (salary ÷ working days) × absent days.</p>
          </div>
        </TabsContent>



        <TabsContent value="savings">
          <SortableTable
            columns={[
              { key: "name", label: "Source" },
              { key: "activated", label: "Activated", numeric: true },
              { key: "reported", label: "Reported", numeric: true },
              { key: "unreported", label: "Unreported", numeric: true },
              { key: "price", label: "CPA Price", numeric: true, render: (v) => fmtMoney(v) },
              { key: "savings", label: "Savings", numeric: true, render: (v) => fmtMoney(v) },
            ]}
            rows={sources.filter((s) => s.model === "CPA").map((s) => ({ ...s, unreported: s.activated - s.reported }))}
          />
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 mt-4">
            <StatCard label="Total Savings" value={fmtMoney(data.cpaSavings)} tone="positive" />
            <StatCard label="Monthly Savings (est.)" value={fmtMoney(data.cpaSavings * forecast.factor)} />
            <StatCard label="Yearly Savings (est.)" value={fmtMoney(data.cpaSavings * forecast.factor * 12)} />
          </div>
        </TabsContent>

        <TabsContent value="marketing">
          <SortableTable
            columns={[
              { key: "name", label: "Source" },
              { key: "totalCost", label: "Spend", numeric: true, render: (v) => fmtMoney(v) },
              { key: "leads", label: "Leads", numeric: true },
              { key: "cpl", label: "CPL", numeric: true, render: (v) => fmtMoney(v) },
              { key: "activated", label: "Activated", numeric: true },
              { key: "cpaEff", label: "CPA", numeric: true, render: (v) => fmtMoney(v) },
              { key: "revenue", label: "Revenue", numeric: true, render: (v) => fmtMoney(v) },
              { key: "roi", label: "ROI", numeric: true, render: (v) => fmtPct(v) },
            ]}
            rows={sources}
          />
        </TabsContent>

        <TabsContent value="expenses">
          <div className="space-y-6">
            <div>
              <h3 className="font-display font-semibold mb-2">By Category</h3>
              <SortableTable
                columns={[
                  { key: "name", label: "Category" },
                  { key: "amount", label: "Amount", numeric: true, render: (v) => fmtMoney(v) },
                  { key: "pct", label: "% of Total", numeric: true, render: (v) => fmtPct(v) },
                ]}
                rows={expByCategory.map((c) => ({ ...c, pct: data.otherExp ? (c.amount / data.otherExp) * 100 : 0 }))}
              />
            </div>
            <div>
              <h3 className="font-display font-semibold mb-2">By Month</h3>
              <SortableTable
                columns={[
                  { key: "month", label: "Month" },
                  { key: "amount", label: "Amount", numeric: true, render: (v) => fmtMoney(v) },
                ]}
                rows={expByMonth}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recurring">
          <SortableTable
            columns={[
              { key: "name", label: "Expense" },
              { key: "category", label: "Category" },
              { key: "frequency", label: "Frequency" },
              { key: "monthly", label: "Monthly", numeric: true, render: (v) => fmtMoney(v) },
              { key: "yearly", label: "Yearly", numeric: true, render: (v) => fmtMoney(v) },
              { key: "next_due_date", label: "Next Due" },
            ]}
            rows={recurringRpt}
          />
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 mt-4">
            <StatCard label="Monthly Fixed Costs" value={fmtMoney(recurringTotals.monthly)} />
            <StatCard label="Yearly Fixed Costs" value={fmtMoney(recurringTotals.yearly)} />
          </div>
        </TabsContent>

        <TabsContent value="revenue">
          <div className="space-y-6">
            <SortableTable
              columns={[
                { key: "date", label: "Date" },
                { key: "amount", label: "Amount", numeric: true, render: (v) => fmtMoney(v) },
              ]}
              rows={revByDay}
            />
            <div>
              <h3 className="font-display font-semibold mb-2">By Employee</h3>
              <SortableTable
                columns={[
                  { key: "name", label: "Employee" },
                  { key: "revenue", label: "Revenue", numeric: true, render: (v) => fmtMoney(v) },
                ]}
                rows={employeesRpt.map((e) => ({ name: e.name, revenue: e.revenue }))}
              />
            </div>
            <div>
              <h3 className="font-display font-semibold mb-2">By Customer</h3>
              <SortableTable
                columns={[
                  { key: "customer_name", label: "Customer" },
                  { key: "amount", label: "Amount", numeric: true, render: (v) => fmtMoney(v) },
                ]}
                rows={Object.values(data.revenue.reduce((acc: any, r: any) => {
                  const k = r.customer_name || "—";
                  acc[k] = acc[k] || { customer_name: k, amount: 0 };
                  acc[k].amount += Number(r.amount);
                  return acc;
                }, {}))}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="funnel">
          <div className="card-surface p-6 space-y-3">
            {funnel.map((f, i) => (
              <div key={f.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-muted-foreground">{f.value} {i > 0 && <span className="ml-2">({fmtPct(f.conv)} from prev)</span>}</span>
                </div>
                <div className="h-8 bg-muted rounded-md overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(f.pct, 2)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="forecast">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="EoM Revenue (proj.)" value={fmtMoney(forecast.revenue)} tone="positive" />
            <StatCard label="EoM Profit (proj.)" value={fmtMoney(forecast.profit)} tone={forecast.profit >= 0 ? "positive" : "negative"} />
            <StatCard label="Expected CPA Costs" value={fmtMoney(forecast.cpaCost)} />
            <StatCard label="Expected Savings" value={fmtMoney(forecast.savings)} tone="positive" />
          </div>
          <p className="text-xs text-muted-foreground mt-3">Projection scales current period performance to a full month (factor ×{forecast.factor.toFixed(2)}).</p>
        </TabsContent>

        <TabsContent value="audit">
          <SortableTable
            columns={[
              { key: "time", label: "Time", render: (v) => new Date(v).toLocaleString() },
              { key: "type", label: "Type" },
              { key: "detail", label: "Detail" },
            ]}
            rows={(activityQ.data ?? []) as any[]}
            searchable
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}
function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

type Col = { key: string; label: string; numeric?: boolean; render?: (v: any, row: any) => React.ReactNode };
function SortableTable({ columns, rows, searchable }: { columns: Col[]; rows: any[]; searchable?: boolean }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    let r = rows;
    if (searchable && search) {
      const q = search.toLowerCase();
      r = r.filter((row) => columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(q)));
    }
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return r;
  }, [rows, sortKey, sortDir, search, columns, searchable]);
  return (
    <div className="space-y-3">
      {searchable && (
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs print:hidden" />
      )}
      <div className="card-surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.numeric ? "text-right" : ""}>
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => { setSortKey(c.key); setSortDir(sortKey === c.key && sortDir === "desc" ? "asc" : "desc"); }}
                  >
                    {c.label} <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>
            ) : filtered.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.numeric ? "text-right tabular-nums" : ""}>
                    {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
