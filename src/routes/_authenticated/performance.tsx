import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { EmployeeLink } from "@/components/employee-link";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/search-input";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";
import { depositsByName, effectiveBalance, qualifiesAsFtd } from "@/lib/rules";
import { useCompanySettings } from "@/lib/settings";
import { fmtMoney } from "@/lib/format";
import { commissionAmount, commissionRate, type CommissionTiers } from "@/lib/commission";

const sb = supabase as any;


export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "Employee Performance — Ledgerly" },
      { name: "description", content: "Monthly results for every agent: FTDs, revenue, commission, withdrawals and net payout." },
      { property: "og:title", content: "Employee Performance — Ledgerly" },
      { property: "og:description", content: "Monthly results for every agent: FTDs, revenue, commission, withdrawals and net payout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerformancePage,
});

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}

function workingDays(startISO: string, endISO: string) {
  let n = 0;
  const d = new Date(startISO);
  const e = new Date(endISO);
  while (d <= e) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

const TEAM_RANK: Record<string, number> = { C: 0, R: 1, M: 2 };
const TEAM_LABEL: Record<string, string> = { C: "Conversion", R: "Retention", M: "Marketing" };

function PerformancePage() {
  const settings = useCompanySettings();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");
  const { start, end } = monthRange(month);

  const empQ = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const revQ = useQuery({
    queryKey: ["perf-revenue", start, end],
    queryFn: async () =>
      await fetchAll(() => sb.from("revenue")
        .select("id,date,amount,employee_id,employee_id_2,split_pct")
        .gte("date", start).lte("date", end)),
  });

  const withQ = useQuery({
    queryKey: ["perf-withdrawals", start, end],
    queryFn: async () =>
      await fetchAll(() => sb.from("withdrawals")
        .select("id,date,amount,employee_penalty,employee_id")
        .gte("date", start).lte("date", end)),
  });

  const attQ = useQuery({
    queryKey: ["perf-attendance", start, end],
    queryFn: async () =>
      await fetchAll(() => sb.from("attendance")
        .select("employee_id,date,present")
        .gte("date", start).lte("date", end)),
  });

  const actQ = useQuery({
    queryKey: ["perf-activations", start, end],
    queryFn: async () => {
      const data = await fetchAll(() => sb
        .from("daily_lead_activations")
        .select("employee_id,conversion_employee_id,lead_name,potential,answered,balance,activated_count,daily_lead_entries!inner(entry_date)")
        .gte("daily_lead_entries.entry_date", start)
        .lte("daily_lead_entries.entry_date", end));
      return data ?? [];
    },
  });

  const depositsQ = useQuery({
    queryKey: ["revenue-by-name"],
    queryFn: async () => {
      const data = await fetchAll(() => sb.from("revenue").select("customer_name, amount"));
      return (data ?? []) as { customer_name: string | null; amount: number }[];
    },
  });

  const rows = useMemo(() => {
    const emps = empQ.data ?? [];
    const wd = workingDays(start, end);

    const deposits = depositsByName(depositsQ.data ?? []);

    return emps.map((emp: any) => {
      const team = String(emp.team ?? "R").toUpperCase();

      const attributed = (revQ.data ?? []).reduce((s: number, r: any) => {
        const amt = Number(r.amount || 0);
        const pct = Number(r.split_pct ?? 100);
        if (r.employee_id === emp.id) return s + amt * (pct / 100);
        if (r.employee_id_2 === emp.id) return s + amt * ((100 - pct) / 100);
        return s;
      }, 0);

      const wds = (withQ.data ?? []).filter((w: any) => w.employee_id === emp.id);
      const withdrawn = wds.reduce((s: number, w: any) => s + Number(w.amount || 0), 0);
      const penalty = wds.reduce((s: number, w: any) => s + Number(w.employee_penalty || 0), 0);

      const tiers: CommissionTiers = {
        commission_tier1_max: Number(emp.commission_tier1_max),
        commission_tier1_pct: Number(emp.commission_tier1_pct),
        commission_tier2_max: Number(emp.commission_tier2_max),
        commission_tier2_pct: Number(emp.commission_tier2_pct),
        commission_tier3_pct: Number(emp.commission_tier3_pct),
      };
      const commission = team === "R" ? commissionAmount(attributed, tiers) : 0;
      const rate = commissionRate(attributed, tiers);

      const att = (attQ.data ?? []).filter((a: any) => a.employee_id === emp.id);
      const absent = att.filter((a: any) => !a.present).length;
      const perDay = wd > 0 ? Number(emp.salary ?? 0) / wd : 0;
      const deduction = absent * perDay;
      const salary = Math.max(0, Number(emp.salary ?? 0) - deduction);

      const acts = (actQ.data ?? []) as any[];
      const clients = acts
        .filter((a) => a.employee_id === emp.id)
        .reduce((s, a) => s + Number(a.activated_count || 0), 0);

      const mine = acts.filter((a) => a.conversion_employee_id === emp.id);
      let ftds = 0;
      let pendingFtds = 0;
      for (const a of mine) {
        const eff = effectiveBalance(a, deposits);
        const ok = qualifiesAsFtd(a, eff, settings);
        if (ok) ftds++;
        else pendingFtds++;
      }
      const ftdCommission = team === "C" ? ftds * settings.ftdCommission : 0;

      const payout = salary + (team === "R" ? commission - penalty : 0) + ftdCommission;

      return {
        id: emp.id,
        name: emp.name,
        team,
        teamLabel: TEAM_LABEL[team] ?? team,
        active: !!emp.active,
        ftds: team === "C" ? ftds : 0,
        pendingFtds: team === "C" ? pendingFtds : 0,
        clients,
        attributed: team === "R" ? attributed : 0,
        commission,
        rate,
        withdrawn: team === "R" ? withdrawn : 0,
        penalty: team === "R" ? penalty : 0,
        absent,
        salary,
        ftdCommission,
        payout,
      };
    })
    .filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (TEAM_RANK[a.team] ?? 3) - (TEAM_RANK[b.team] ?? 3) || a.name.localeCompare(b.name));
  }, [empQ.data, revQ.data, withQ.data, attQ.data, actQ.data, depositsQ.data, start, end, search, settings]);

  const { sorted, sort, toggle } = useSort<any>(rows, {
    name: (r) => r.name,
    team: (r) => TEAM_RANK[r.team] ?? 3,
    ftds: (r) => r.ftds,
    clients: (r) => r.clients,
    attributed: (r) => r.attributed,
    commission: (r) => r.commission + r.ftdCommission,
    withdrawn: (r) => r.withdrawn,
    absent: (r) => r.absent,
    salary: (r) => r.salary,
    payout: (r) => r.payout,
  });
  const { pageItems, ...pg } = usePagination(sorted, 30);

  const totals = useMemo(() => ({
    ftds: rows.reduce((s, r) => s + r.ftds, 0),
    revenue: rows.reduce((s, r) => s + r.attributed, 0),
    commission: rows.reduce((s, r) => s + r.commission + r.ftdCommission, 0),
    payout: rows.reduce((s, r) => s + r.payout, 0),
  }), [rows]);

  const loading = empQ.isLoading || revQ.isLoading || actQ.isLoading;

  return (
    <div>
      <PageHeader
        title="Employee Performance"
        description="Monthly results per agent — conversion first, then retention."
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search agents…" className="w-56" />
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
          </div>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total FTDs" value={String(totals.ftds)} tone="positive" />
        <StatCard label="Attributed revenue" value={fmtMoney(totals.revenue)} tone="positive" />
        <StatCard label="Total commission" value={fmtMoney(totals.commission)} />
        <StatCard label="Total payout" value={fmtMoney(totals.payout)} tone="negative" />
      </section>

      <div className="card-surface overflow-hidden">
        {loading ? (
          <TableSkeleton cols={8} />
        ) : sorted.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No employees match.</div>
        ) : (
          <>
          <DataCardList>
            {pageItems.map((r: any) => (
              <DataCard
                key={r.id}
                title={r.name}
                subtitle={`Team ${r.team ?? "C"}`}
                fields={[
                  { label: "FTDs", value: <span className="num">{r.ftds}</span> },
                  { label: "Clients", value: <span className="num">{r.clients}</span> },
                  { label: "Revenue", value: <span className="num">{fmtMoney(r.attributed)}</span> },
                  { label: "Net payout", value: <span className="num font-medium">{fmtMoney(r.payout)}</span> },
                ]}
              />
            ))}
          </DataCardList>
          <div className="hidden md:block overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <SortTh label="Agent" k="name" sort={sort} toggle={toggle} />
                  <SortTh label="Dept" k="team" sort={sort} toggle={toggle} />
                  <SortTh label="FTDs" k="ftds" sort={sort} toggle={toggle} />
                  <SortTh label="Clients" k="clients" sort={sort} toggle={toggle} />
                  <SortTh label="Revenue" k="attributed" sort={sort} toggle={toggle} />
                  <SortTh label="Commission" k="commission" sort={sort} toggle={toggle} />
                  <SortTh label="Withdrawals" k="withdrawn" sort={sort} toggle={toggle} />
                  <SortTh label="Absences" k="absent" sort={sort} toggle={toggle} />
                  <SortTh label="Salary" k="salary" sort={sort} toggle={toggle} />
                  <SortTh label="Net payout" k="payout" sort={sort} toggle={toggle} />
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                    onClick={() => navigate({ to: "/employees/$id", params: { id: r.id } })}
                  >
                    <td className="py-3 px-4 font-medium">
                      <EmployeeLink id={r.id} name={r.name} />
                      {!r.active && <span className="ml-2 text-xs text-muted-foreground">inactive</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs font-medium">{r.teamLabel}</span>
                    </td>
                    <td className="py-3 px-4">
                      {r.team === "C" ? (
                        <>
                          {r.ftds}
                          {r.pendingFtds > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">(+{r.pendingFtds} pending)</span>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-4">{r.team === "M" ? "—" : r.clients}</td>
                    <td className="py-3 px-4">{r.team === "R" ? fmtMoney(r.attributed) : "—"}</td>
                    <td className="py-3 px-4 text-primary">
                      {r.team === "R"
                        ? `${fmtMoney(r.commission)} · ${r.rate}%`
                        : r.team === "C"
                          ? fmtMoney(r.ftdCommission)
                          : "—"}
                    </td>
                    <td className="py-3 px-4">
                      {r.team === "R" ? (
                        <span className="text-destructive">
                          −{fmtMoney(r.withdrawn)}
                          {r.penalty > 0 && <span className="text-xs"> (−{fmtMoney(r.penalty)})</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-4">{r.absent}</td>
                    <td className="py-3 px-4">{fmtMoney(r.salary)}</td>
                    <td className="py-3 px-4 font-medium">{fmtMoney(r.payout)}</td>
                    <td className="py-3 px-4 text-right">
                      <Link to="/employees/$id" params={{ id: r.id }} className="text-primary hover:underline text-xs">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pg} />
          </>
        )}
      </div>
    </div>
  );
}
