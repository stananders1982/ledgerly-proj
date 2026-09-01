/**
 * Command Center — the operations cockpit at the top of the dashboard.
 *
 * Four blocks answer "what needs attention right now?":
 *   1. Today's priorities   — countable work items with a link to the page.
 *   2. Exceptions           — things that look wrong and need a human.
 *   3. Cash position        — money in the bank today and what is committed.
 *   4. Manager alerts       — trends moving the wrong way over 30 days.
 *
 * Everything is derived from the same tables the rest of the app reads, so the
 * numbers always agree with the detail pages they link to.
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Banknote, ClipboardList, Gauge, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtMoney } from "@/lib/format";
import { toDisplay, fromWorkspace, useFxRates } from "@/lib/fx";
import { useCompanySettings } from "@/lib/settings";
import { useAffiliateBalanceAlerts } from "@/lib/affiliate-alerts";
import { depositFee } from "@/lib/profitability";
import { isOverduePayout } from "@/lib/withdrawal-status";
import { kycStatus } from "@/lib/kyc";
import { cn } from "@/lib/utils";

const sb = supabase as any;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const advance = (dateISO: string, freq: string) => {
  const d = new Date(dateISO + "T12:00:00");
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else if (freq === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return iso(d);
};

/** Occurrences of active recurring schedules landing inside a window. */
function expand(rows: any[], startISO: string, endISO: string) {
  const out: { date: string; amount: number; currency: string | null; name: string }[] = [];
  for (const r of rows ?? []) {
    let d: string = r.next_due_date;
    let guard = 0;
    while (d && d <= endISO && guard < 400) {
      if ((!r.end_date || d <= r.end_date) && d >= startISO) {
        out.push({ date: d, amount: Number(r.amount || 0), currency: r.currency ?? null, name: r.name });
      }
      d = advance(d, String(r.frequency));
      guard++;
    }
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function CommandCenter() {
  useFxRates(); // keep conversions live when rates land
  const settings = useCompanySettings();
  const affiliateAlerts = useAffiliateBalanceAlerts();

  const today = iso(new Date());
  const since = iso(addDays(new Date(), -180));

  const q = useQuery({
    queryKey: ["command-center", today],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const [
        tasks, withdrawals, revenue, expenses, recRevenue, recExpenses,
        activations, entries, sources, employees, salaries,
      ] = await Promise.all([
        fetchAll(() => sb.from("tasks").select("id,title,due_date,status,client_name").neq("status", "done")),
        fetchAll(() => sb.from("withdrawals").select("id,customer_name,amount,currency,date,status,requested_at").gte("date", since)),
        fetchAll(() => sb.from("revenue").select("id,customer_name,amount,currency,date,method,fee_pct,fee_amount,activation_id,employee_id").gte("date", since)),
        fetchAll(() => sb.from("expenses").select("amount,currency,date").gte("date", since)),
        fetchAll(() => sb.from("recurring_revenue").select("name,amount,frequency,next_due_date,end_date,active").eq("active", true)),
        fetchAll(() => sb.from("recurring_expenses").select("name,amount,frequency,next_due_date,end_date,active").eq("active", true)),
        fetchAll(() => sb.from("daily_lead_activations").select("id,lead_name,activation_date,qualified_at,employee_id,kyc,potential_value,balance").eq("legacy", false)),
        fetchAll(() => sb.from("daily_lead_entries").select("entry_date,received,activated,source_id").gte("entry_date", since)),
        fetchAll(() => sb.from("lead_sources").select("id,name")),
        sb.rpc("list_employees_directory").then((r: any) => r.data ?? []),
        // Salaries are admin-only; a non-admin simply sees no payroll figure.
        sb.from("employees").select("salary,active").then((r: any) => (r.error ? null : r.data)),
      ]);
      return { tasks, withdrawals, revenue, expenses, recRevenue, recExpenses, activations, entries, sources, employees, salaries };
    },
  });

  const d = q.data;

  const model = useMemo(() => {
    const now = new Date();
    const d30 = iso(addDays(now, -30));
    const d60 = iso(addDays(now, -60));

    const tasks = (d?.tasks ?? []) as any[];
    const withdrawals = (d?.withdrawals ?? []) as any[];
    const revenue = (d?.revenue ?? []) as any[];
    const expenses = (d?.expenses ?? []) as any[];
    const activations = (d?.activations ?? []) as any[];
    const entries = (d?.entries ?? []) as any[];
    const employees = (d?.employees ?? []) as any[];

    /* ---------------------------------------------------- priorities */
    const dueTasks = tasks.filter((t) => t.due_date && t.due_date <= today);
    const overduePayouts = withdrawals.filter((w) => isOverduePayout(w, settings));
    const affAlerts = affiliateAlerts.data ?? [];
    const retention = new Set(employees.filter((e) => e.team === "R").map((e) => e.id));
    const unallocatedFtds = activations.filter(
      (a) => a.qualified_at && (!a.employee_id || !retention.has(a.employee_id)),
    );
    const expectedToday = sum(
      expand((d?.recRevenue ?? []) as any[], today, today).map((r) => fromWorkspace(r.amount)),
    );

    /* ---------------------------------------------------- exceptions */
    const deposits = revenue.map((r) => ({ ...r, disp: toDisplay(r.amount, r.currency) }));
    const depAvg = deposits.length ? sum(deposits.map((r) => r.disp)) / deposits.length : 0;
    const wdDisp = withdrawals.map((w) => ({ ...w, disp: toDisplay(w.amount, w.currency) }));
    const wdAvg = wdDisp.length ? sum(wdDisp.map((w) => w.disp)) / wdDisp.length : 0;

    const unusualWithdrawals = wdDisp.filter((w) => wdAvg > 0 && w.disp > wdAvg * 3 && w.date >= d30);
    const suspiciousDeposits = deposits.filter((r) => depAvg > 0 && r.disp > depAvg * 4 && r.date >= d30);

    const qualified = activations.filter((a) => a.qualified_at);
    const missingKyc = qualified.filter((a) => kycStatus(a.kyc) !== "complete");
    const negativeAffiliates = affAlerts.filter((a) => a.balance < 0);

    const dep30 = sum(deposits.filter((r) => r.date >= d30).map((r) => r.disp));
    const wd30 = sum(wdDisp.filter((w) => w.date >= d30).map((w) => w.disp));
    const withdrawalRate = dep30 > 0 ? (wd30 / dep30) * 100 : 0;

    /* ------------------------------------------------------- cash */
    const fees = sum(deposits.map((r) => depositFee(r, settings)));
    const depAll = sum(deposits.map((r) => r.disp));
    const expAll = sum(expenses.map((e) => toDisplay(e.amount, e.currency)));
    const paidOut = sum(wdDisp.filter((w) => w.status === "paid" || !w.status).map((w) => w.disp));
    const cashToday = depAll - fees - expAll - paidOut;

    const inflow = (days: number) =>
      sum(expand((d?.recRevenue ?? []) as any[], today, iso(addDays(now, days))).map((r) => fromWorkspace(r.amount)));
    const committed30 = sum(
      expand((d?.recExpenses ?? []) as any[], today, iso(addDays(now, 30))).map((r) => fromWorkspace(r.amount)),
    );
    const payroll = Array.isArray(d?.salaries)
      ? fromWorkspace(sum((d!.salaries as any[]).filter((e) => e.active).map((e) => Number(e.salary || 0))))
      : null;

    /* -------------------------------------------- manager alerts */
    const inWindow = (dateStr: string | null | undefined, from: string, to: string) =>
      !!dateStr && dateStr >= from && dateStr < to;

    const ftdByEmp = (from: string, to: string) => {
      const m = new Map<string, number>();
      for (const a of qualified) {
        if (!inWindow(a.qualified_at?.slice(0, 10), from, to)) continue;
        if (!a.employee_id) continue;
        m.set(a.employee_id, (m.get(a.employee_id) ?? 0) + 1);
      }
      return m;
    };
    const cur = ftdByEmp(d30, iso(addDays(now, 1)));
    const prev = ftdByEmp(d60, d30);
    const nameOf = new Map(employees.map((e) => [e.id, e.name]));
    const droppingEmployees = [...prev.entries()]
      .map(([id, was]) => ({ id, name: nameOf.get(id) ?? "Agent", was, now: cur.get(id) ?? 0 }))
      .filter((r) => r.was >= 3 && r.now < r.was * 0.7)
      .sort((a, b) => a.now - a.was - (b.now - b.was))
      .slice(0, 4);

    const srcName = new Map(((d?.sources ?? []) as any[]).map((s) => [s.id, s.name]));
    const rateBySource = (from: string, to: string) => {
      const m = new Map<string, { rec: number; act: number }>();
      for (const e of entries) {
        if (!inWindow(e.entry_date, from, to)) continue;
        const k = e.source_id ?? "none";
        const c = m.get(k) ?? { rec: 0, act: 0 };
        c.rec += Number(e.received || 0);
        c.act += Number(e.activated || 0);
        m.set(k, c);
      }
      return m;
    };
    const rc = rateBySource(d30, iso(addDays(now, 1)));
    const rp = rateBySource(d60, d30);
    const fallingSources = [...rp.entries()]
      .map(([id, was]) => {
        const nowC = rc.get(id) ?? { rec: 0, act: 0 };
        const wasRate = was.rec ? (was.act / was.rec) * 100 : 0;
        const nowRate = nowC.rec ? (nowC.act / nowC.rec) * 100 : 0;
        return { id, name: srcName.get(id) ?? "Unattributed", wasRate, nowRate, rec: was.rec };
      })
      .filter((r) => r.rec >= 20 && r.wasRate > 0 && r.nowRate < r.wasRate * 0.75)
      .slice(0, 4);

    const depositorsIn = (from: string, to: string) =>
      new Set(deposits.filter((r) => inWindow(r.date, from, to)).map((r) => r.activation_id ?? r.customer_name));
    const curDep = depositorsIn(d30, iso(addDays(now, 1)));
    const prevDep = depositorsIn(d60, d30);
    const churned = [...prevDep].filter((k) => !curDep.has(k)).length;
    const churnRate = prevDep.size ? (churned / prevDep.size) * 100 : 0;

    return {
      dueTasks, overduePayouts, affAlerts, unallocatedFtds, expectedToday,
      unusualWithdrawals, suspiciousDeposits, missingKyc, negativeAffiliates, withdrawalRate,
      cashToday, in7: inflow(7), in30: inflow(30), in90: inflow(90), committed30, payroll,
      droppingEmployees, fallingSources, churned, churnRate, prevDepositors: prevDep.size,
    };
  }, [d, settings, affiliateAlerts.data, today]);

  if (q.isLoading) {
    return <div className="mb-4 h-40 animate-pulse rounded-xl border border-border/60 bg-card/60" />;
  }
  if (q.isError || !d) return null;

  const m = model;

  const priorities = [
    m.dueTasks.length && {
      text: `${m.dueTasks.length} client${m.dueTasks.length === 1 ? "" : "s"} need follow-up`,
      to: "/tasks", search: undefined as any,
    },
    m.overduePayouts.length && {
      text: `${m.overduePayouts.length} withdrawal${m.overduePayouts.length === 1 ? " is" : "s are"} SLA overdue`,
      to: "/withdrawals", search: undefined as any,
    },
    m.affAlerts.length && {
      text: `${m.affAlerts.length} affiliate${m.affAlerts.length === 1 ? " is" : "s are"} below minimum balance`,
      to: "/affiliates", search: undefined as any,
    },
    m.unallocatedFtds.length && {
      text: `${m.unallocatedFtds.length} unallocated FTD${m.unallocatedFtds.length === 1 ? "" : "s"}`,
      to: "/activations", search: { issue: "clients-unallocated-ftd" } as any,
    },
    m.expectedToday > 0 && {
      text: `${fmtMoney(m.expectedToday)} expected deposits today`,
      to: "/revenue", search: undefined as any,
    },
  ].filter(Boolean) as { text: string; to: string; search?: any }[];

  const exceptions = [
    m.unusualWithdrawals.length && {
      text: `${m.unusualWithdrawals.length} unusual withdrawal${m.unusualWithdrawals.length === 1 ? "" : "s"}`,
      hint: m.unusualWithdrawals.slice(0, 2).map((w: any) => `${w.customer_name} ${fmtMoney(w.disp)}`).join(" · "),
      to: "/withdrawals", search: undefined as any,
    },
    m.missingKyc.length && {
      text: `${m.missingKyc.length} qualified client${m.missingKyc.length === 1 ? "" : "s"} missing KYC`,
      hint: m.missingKyc.slice(0, 2).map((a: any) => a.lead_name).filter(Boolean).join(" · "),
      to: "/activations", search: undefined as any,
    },
    m.negativeAffiliates.length && {
      text: `${m.negativeAffiliates.length} affiliate${m.negativeAffiliates.length === 1 ? " has" : "s have"} a negative balance`,
      hint: m.negativeAffiliates.slice(0, 2).map((a: any) => `${a.name} ${fmtMoney(a.balance)}`).join(" · "),
      to: "/affiliates", search: undefined as any,
    },
    m.suspiciousDeposits.length && {
      text: `${m.suspiciousDeposits.length} deposit${m.suspiciousDeposits.length === 1 ? "" : "s"} far above the usual size`,
      hint: m.suspiciousDeposits.slice(0, 2).map((r: any) => `${r.customer_name} ${fmtMoney(r.disp)}`).join(" · "),
      to: "/revenue", search: undefined as any,
    },
    m.withdrawalRate > 40 && {
      text: `Withdrawal rate is ${m.withdrawalRate.toFixed(0)}% of deposits (30d)`,
      hint: "Above the 40% comfort line — check retention and payout pressure.",
      to: "/withdrawals", search: undefined as any,
    },
  ].filter(Boolean) as { text: string; hint?: string; to: string; search?: any }[];

  const managerAlerts = [
    ...m.droppingEmployees.map((e) => ({
      text: `${e.name}: FTDs down ${e.was} → ${e.now} vs last month`,
      to: `/employees/${e.id}`,
    })),
    ...m.fallingSources.map((s) => ({
      text: `${s.name}: conversion ${s.wasRate.toFixed(0)}% → ${s.nowRate.toFixed(0)}%`,
      to: "/sources",
    })),
    ...(m.churnRate > 30 && m.prevDepositors >= 5
      ? [{ text: `Client churn at ${m.churnRate.toFixed(0)}% — ${m.churned} depositors went quiet`, to: "/activations" }]
      : []),
  ];

  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <Panel title="Today's priorities" icon={<ClipboardList className="h-4 w-4" />} tone="sky">
        {priorities.length === 0 ? (
          <Clear>Nothing waiting — the queue is clear.</Clear>
        ) : (
          <ul className="space-y-1.5">
            {priorities.map((p) => (
              <li key={p.text}>
                <Link
                  to={p.to as any}
                  search={p.search}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  <span className="min-w-0 flex-1">{p.text}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Exceptions" icon={<ShieldAlert className="h-4 w-4" />} tone="rose">
        {exceptions.length === 0 ? (
          <Clear>No exceptions detected in the last 30 days.</Clear>
        ) : (
          <ul className="space-y-1.5">
            {exceptions.map((e) => (
              <li key={e.text}>
                <Link
                  to={e.to as any}
                  search={e.search}
                  className="group block rounded-md px-2 py-1.5 transition-colors hover:bg-foreground/5"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                    <span className="min-w-0 flex-1">{e.text}</span>
                  </span>
                  {e.hint ? <span className="ml-6 block truncate text-xs text-muted-foreground">{e.hint}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Cash position" icon={<Banknote className="h-4 w-4" />} tone="emerald">
        <dl className="space-y-1.5 text-sm">
          <Row label="Cash today" value={fmtMoney(m.cashToday)} strong tone={m.cashToday < 0 ? "bad" : "good"} />
          <Row label="Expected in 7 days" value={fmtMoney(m.in7)} />
          <Row label="Expected in 30 days" value={fmtMoney(m.in30)} />
          <Row label="Expected in 90 days" value={fmtMoney(m.in90)} />
          <Row label="Committed expenses (30d)" value={fmtMoney(m.committed30)} tone="bad" />
          <Row
            label="Expected payroll (monthly)"
            value={m.payroll == null ? "—" : fmtMoney(m.payroll)}
            tone={m.payroll == null ? undefined : "bad"}
          />
        </dl>
      </Panel>

      <Panel title="Manager alerts" icon={<Gauge className="h-4 w-4" />} tone="amber">
        {managerAlerts.length === 0 ? (
          <Clear>Performance, sources and churn are all steady.</Clear>
        ) : (
          <ul className="space-y-1.5">
            {managerAlerts.slice(0, 6).map((a) => (
              <li key={a.text}>
                <Link
                  to={a.to as any}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span className="min-w-0 flex-1">{a.text}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}

/* --------------------------------------------------------------- pieces */

const toneRing: Record<string, string> = {
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

function Panel({
  title, icon, tone, children,
}: { title: string; icon: React.ReactNode; tone: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg", toneRing[tone])}>{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

const Clear = ({ children }: { children: React.ReactNode }) => (
  <p className="px-2 py-1.5 text-sm text-muted-foreground">{children}</p>
);

function Row({
  label, value, strong, tone,
}: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong && "text-base font-semibold",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
