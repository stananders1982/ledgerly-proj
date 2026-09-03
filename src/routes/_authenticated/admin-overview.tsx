import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  Clock3,
  Loader2,
  Search,
  TrendingUp,
  UserRoundCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth-context";
import { useCompanySettings } from "@/lib/settings";
import { toDisplay, useFxRates } from "@/lib/fx";
import { fmtDate, fmtMoney, fmtPct, useDisplayCurrency } from "@/lib/format";
import { isOverduePayout, isPendingPayout, WITHDRAWAL_STATUS_LABELS } from "@/lib/withdrawal-status";
import { DEPOSIT_REQUEST_STATUS_LABELS } from "@/lib/deposit-requests";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, ActiveBadge } from "@/components/status-badge";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { TableFrame } from "@/components/table-frame";
import { TableSkeleton } from "@/components/table-skeleton";
import { QueryError } from "@/components/query-error";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin-overview")({
  head: () => ({
    meta: [
      { title: "Admin Overview — Ledgerly" },
      { name: "description", content: "Monitor requests, deposits, income, withdrawals, leads and agents in one operational view." },
      { property: "og:title", content: "Admin Overview — Ledgerly" },
      { property: "og:description", content: "Monitor requests, deposits, income, withdrawals, leads and agents in one operational view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverviewPage,
});

type TabKey = "requests" | "deposits" | "income" | "withdrawals" | "leads" | "agents";
type Row = Record<string, any>;

const TAB_LABELS: Record<TabKey, string> = {
  requests: "Requests",
  deposits: "Client deposits",
  income: "Other income",
  withdrawals: "Withdrawals",
  leads: "Leads",
  agents: "Agents",
};

const statusTone = (status?: string | null): "success" | "warning" | "danger" | "info" | "muted" => {
  if (["confirmed", "paid", "activated", "active"].includes(status ?? "")) return "success";
  if (["pending", "requested", "new"].includes(status ?? "")) return "warning";
  if (["rejected", "lost", "cancelled"].includes(status ?? "")) return "danger";
  if (["approved", "processing", "contacted", "qualified"].includes(status ?? "")) return "info";
  return "muted";
};

const rowDate = (value?: string | null) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).getTime() : 0;

function AdminOverviewPage() {
  const { isAdmin, companyId, permsLoaded } = useAuth();
  const navigate = useNavigate();
  const settings = useCompanySettings();
  useFxRates();
  useDisplayCurrency();

  const [tab, setTab] = useState<TabKey>("requests");
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [agent, setAgent] = useState("all");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const activeRange = useMemo(() => getRange(range, { start: customStart, end: customEnd }), [range, customStart, customEnd]);

  useEffect(() => {
    if (permsLoaded && !isAdmin) navigate({ to: "/", replace: true });
  }, [isAdmin, navigate, permsLoaded]);

  useEffect(() => {
    setStatus("all");
    setPage(1);
  }, [tab]);

  const enabled = isAdmin && !!companyId;
  const requestsQ = useQuery({
    enabled,
    queryKey: ["admin-overview-requests", companyId],
    queryFn: () => fetchAll(() => supabase.from("deposit_requests").select("*").order("request_date", { ascending: false })),
  });
  const revenueQ = useQuery({
    enabled,
    queryKey: ["admin-overview-revenue", companyId],
    queryFn: () => fetchAll(() => supabase.from("revenue").select("*, employees:employee_id(name), employee2:employee_id_2(name), affiliates:affiliate_id(name)").order("date", { ascending: false })),
  });
  const withdrawalsQ = useQuery({
    enabled,
    queryKey: ["admin-overview-withdrawals", companyId],
    queryFn: () => fetchAll(() => supabase.from("withdrawals").select("*, employees:employee_id(name), employee2:employee_id_2(name), affiliates:affiliate_id(name)").order("date", { ascending: false })),
  });
  const leadsQ = useQuery({
    enabled,
    queryKey: ["admin-overview-leads", companyId],
    queryFn: () => fetchAll(() => supabase.from("leads").select("*, lead_sources:source_id(id,name), employees:employee_id(name)").order("created_at", { ascending: false })),
  });
  const entriesQ = useQuery({
    enabled,
    queryKey: ["admin-overview-lead-entries", companyId],
    queryFn: () => fetchAll(() => supabase.from("daily_lead_entries").select("id,entry_date,received,invalid,activated,source_id").order("entry_date", { ascending: false })),
  });
  const activationsQ = useQuery({
    enabled,
    queryKey: ["admin-overview-activations", companyId],
    queryFn: () => fetchAll(() => supabase.from("daily_lead_activations").select("id,lead_name,activation_date,employee_id,conversion_employee_id,entry_id,legacy")),
  });
  const employeesQ = useQuery({
    enabled,
    queryKey: ["admin-overview-employees", companyId],
    queryFn: () => fetchAll(() => supabase.from("employees").select("id,name,email,role,team,active").order("name")),
  });
  const sourcesQ = useQuery({
    enabled,
    queryKey: ["admin-overview-sources", companyId],
    queryFn: () => fetchAll(() => supabase.from("lead_sources").select("id,name").order("name")),
  });

  if (!permsLoaded || !isAdmin) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const queries = [requestsQ, revenueQ, withdrawalsQ, leadsQ, entriesQ, activationsQ, employeesQ, sourcesQ];
  const errorQuery = queries.find((q) => q.error);
  const loading = queries.some((q) => q.isLoading);
  const employees = (employeesQ.data ?? []) as Row[];
  const employeeName = (id?: string | null) => employees.find((e) => e.id === id)?.name ?? "—";
  const inRange = (value?: string | null) => {
    const time = rowDate(value);
    return time >= activeRange.start.getTime() && time <= activeRange.end.getTime();
  };
  const matchesText = (...values: unknown[]) => !search.trim() || values.some((v) => String(v ?? "").toLowerCase().includes(search.trim().toLowerCase()));
  const matchesAgent = (row: Row) => agent === "all" || row.employee_id === agent || row.employee_id_2 === agent || row.conversion_employee_id === agent;

  const requests = ((requestsQ.data ?? []) as Row[]).filter((r) => inRange(r.request_date) && matchesAgent(r) && matchesText(r.client_name, r.requested_by_email));
  const confirmedRevenueIds = new Set(((requestsQ.data ?? []) as Row[]).filter((r) => r.status === "confirmed" && r.revenue_id).map((r) => r.revenue_id));
  const revenue = ((revenueQ.data ?? []) as Row[]).filter((r) => inRange(r.date) && matchesAgent(r) && matchesText(r.customer_name, r.notes, r.affiliates?.name));
  const deposits = revenue.filter((r) => confirmedRevenueIds.has(r.id));
  const otherIncome = revenue.filter((r) => !confirmedRevenueIds.has(r.id));
  const withdrawals = ((withdrawalsQ.data ?? []) as Row[]).filter((r) => inRange(r.date) && matchesAgent(r) && matchesText(r.customer_name, r.affiliates?.name));
  const leads = ((leadsQ.data ?? []) as Row[]).filter((r) =>
    inRange(r.created_at) && matchesAgent(r) && (source === "all" || r.source_id === source) && matchesText(r.name, r.email, r.phone, r.lead_sources?.name),
  );
  const entries = ((entriesQ.data ?? []) as Row[]).filter((r) => inRange(r.entry_date) && (source === "all" || r.source_id === source));
  const activations = ((activationsQ.data ?? []) as Row[]).filter((r) => inRange(r.activation_date) && matchesAgent(r) && !r.legacy);

  const requestRows = status === "all" ? requests : requests.filter((r) => r.status === status);
  const withdrawalRows = status === "all" ? withdrawals : withdrawals.filter((r) => (r.status ?? "paid") === status);
  const leadRows = status === "all" ? leads : leads.filter((r) => r.status === status);
  const agentRows = employees.filter((e) => (status === "all" || (status === "active") === !!e.active) && (agent === "all" || e.id === agent) && matchesText(e.name, e.email, e.role));

  const requestedPending = requests.filter((r) => r.status === "pending");
  const awaitingFunds = requests.filter((r) => r.status === "approved");
  const pendingWithdrawals = withdrawals.filter(isPendingPayout);
  const overdueWithdrawals = pendingWithdrawals.filter((r) => isOverduePayout(r, settings));
  const validLeads = entries.reduce((sum, r) => sum + Math.max(0, Number(r.received ?? 0) - Number(r.invalid ?? 0)), 0);
  const receivedLeads = entries.reduce((sum, r) => sum + Number(r.received ?? 0), 0);
  const activatedFtds = agent === "all" ? entries.reduce((sum, r) => sum + Number(r.activated ?? 0), 0) : activations.length;
  const activeAgents = employees.filter((e) => e.active);
  const unassigned = leads.filter((r) => !r.employee_id).length + activations.filter((r) => !r.employee_id && !r.conversion_employee_id).length;
  const sumMoney = (rows: Row[], key = "amount") => rows.reduce((sum, r) => sum + toDisplay(r[key], r.currency), 0);
  const requestValue = (rows: Row[]) => rows.reduce((sum, r) => sum + toDisplay(r.amount, r.currency), 0);

  const agentMetrics = agentRows.map((e) => {
    const assignedLeads = leads.filter((r) => r.employee_id === e.id);
    const ftds = activations.filter((r) => r.employee_id === e.id || r.conversion_employee_id === e.id);
    const agentDeposits = deposits.reduce((sum, r) => {
      const amount = toDisplay(r.amount, r.currency);
      const pct = Number(r.split_pct ?? 100) / 100;
      if (r.employee_id === e.id) return sum + amount * (r.employee_id_2 ? pct : 1);
      if (r.employee_id_2 === e.id) return sum + amount * (1 - pct);
      return sum;
    }, 0);
    const agentWithdrawals = withdrawals.filter((r) => r.employee_id === e.id || r.employee_id_2 === e.id);
    return { ...e, leadCount: assignedLeads.length, ftdCount: ftds.length, depositTotal: agentDeposits, withdrawalTotal: sumMoney(agentWithdrawals), conversion: assignedLeads.length ? ftds.length / assignedLeads.length * 100 : 0 };
  });

  const statusOptions = tab === "requests"
    ? ["pending", "approved", "confirmed", "rejected", "cancelled"]
    : tab === "withdrawals"
      ? ["requested", "processing", "paid", "rejected"]
      : tab === "leads"
        ? ["new", "contacted", "qualified", "activated", "lost"]
        : tab === "agents" ? ["active", "inactive"] : [];

  const selectedRows: Row[] = tab === "requests" ? requestRows : tab === "deposits" ? deposits : tab === "income" ? otherIncome : tab === "withdrawals" ? withdrawalRows : tab === "leads" ? leadRows : agentMetrics;
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(selectedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = selectedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const clearFilters = () => {
    setRange("month"); setCustomStart(""); setCustomEnd(""); setAgent("all"); setSource("all"); setStatus("all"); setSearch(""); setPage(1);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Operations overview"
        description="Requests, money movement, leads and agent activity in one control surface."
      />

      <div className="mb-5 space-y-3 border-b border-border/70 pb-5">
        <DateRangePicker value={range} onChange={(v) => { setRange(v); setPage(1); }} customStart={customStart} customEnd={customEnd} onCustomChange={(start, end) => { setCustomStart(start); setCustomEnd(end); setPage(1); }} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_180px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search client, lead, email…" className="pl-9" />
          </div>
          <Select value={agent} onValueChange={(v) => { setAgent(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="All agents" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All agents</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={source} onValueChange={(v) => { setSource(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All sources</SelectItem>{((sourcesQ.data ?? []) as Row[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} disabled={!statusOptions.length} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem>{statusOptions.map((s) => <SelectItem key={s} value={s}>{DEPOSIT_REQUEST_STATUS_LABELS[s] ?? WITHDRAWAL_STATUS_LABELS[s] ?? `${s.charAt(0).toUpperCase()}${s.slice(1)}`}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={clearFilters}><X className="h-4 w-4" /> Clear</Button>
        </div>
      </div>

      {errorQuery ? <QueryError error={errorQuery.error} onRetry={() => errorQuery.refetch()} /> : loading ? <TableSkeleton cols={6} rows={8} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7" aria-label="Operational totals">
            <StatCard label="Pending approval" value={String(requestedPending.length)} icon={Clock3} hint={fmtMoney(requestValue(requestedPending))} />
            <StatCard label="Awaiting funds" value={String(awaitingFunds.length)} icon={Banknote} hint={fmtMoney(requestValue(awaitingFunds))} />
            <StatCard label="Client deposits" value={fmtMoney(sumMoney(deposits))} icon={CircleDollarSign} hint={`${deposits.length} confirmed`} tone="positive" />
            <StatCard label="Other income" value={fmtMoney(sumMoney(otherIncome))} icon={TrendingUp} hint={`${otherIncome.length} records`} tone="positive" />
            <StatCard label="Withdrawals" value={fmtMoney(sumMoney(withdrawals))} icon={WalletCards} hint={`${pendingWithdrawals.length} pending · ${overdueWithdrawals.length} overdue`} tone={overdueWithdrawals.length ? "negative" : "default"} />
            <StatCard label="Leads / FTDs" value={`${receivedLeads} / ${activatedFtds}`} icon={Users} hint={`${validLeads} valid · ${fmtPct(validLeads ? activatedFtds / validLeads * 100 : 0)} conversion`} />
            <StatCard label="Active agents" value={String(activeAgents.length)} icon={UserRoundCheck} hint={`${activeAgents.filter((e) => e.team === "C").length} conversion · ${activeAgents.filter((e) => e.team === "R").length} retention`} />
          </section>

          <section className="my-6" aria-label="Needs attention">
            <div className="mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /><h2 className="text-sm font-semibold">Needs attention</h2></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <AttentionLink to="/deposit-requests" label="Pending approvals" value={requestedPending.length} />
              <AttentionLink to="/deposit-requests" label="Awaiting funds" value={awaitingFunds.length} />
              <AttentionLink to="/withdrawals" label="Overdue withdrawals" value={overdueWithdrawals.length} />
              <AttentionLink to="/leads" label="Unassigned records" value={unassigned} />
            </div>
          </section>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <div className="overflow-x-auto scroll-slim"><TabsList className="w-max">{(Object.keys(TAB_LABELS) as TabKey[]).map((key) => <TabsTrigger key={key} value={key}>{TAB_LABELS[key]}</TabsTrigger>)}</TabsList></div>
            {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
              <TabsContent key={key} value={key} className="mt-4">
                <OperationsTable tab={key} rows={visibleRows} employeeName={employeeName} />
              </TabsContent>
            ))}
          </Tabs>

          {selectedRows.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, selectedRows.length)} of {selectedRows.length}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Button size="sm" variant="outline" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AttentionLink({ to, label, value }: { to: "/deposit-requests" | "/withdrawals" | "/leads"; label: string; value: number }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent">
      <span className="text-muted-foreground">{label}</span><span className={cn("font-semibold num", value > 0 && "text-warning")}>{value}</span>
    </Link>
  );
}

function OperationsTable({ tab, rows, employeeName }: { tab: TabKey; rows: Row[]; employeeName: (id?: string | null) => string }) {
  if (!rows.length) return <EmptyState icon={Search} title={`No ${TAB_LABELS[tab].toLowerCase()} found`} description="Try changing the date range or filters." />;
  return (
    <TableFrame resizeKey={`admin-overview-${tab}`} maxHeight="620px">
      <table className="w-full min-w-[850px] text-sm">
        <thead className="sticky top-0 z-[1] bg-card text-left text-xs text-muted-foreground"><TableHead tab={tab} /></thead>
        <tbody className="divide-y divide-border/70">{rows.map((row) => <TableRow key={row.id} tab={tab} row={row} employeeName={employeeName} />)}</tbody>
      </table>
    </TableFrame>
  );
}

function TableHead({ tab }: { tab: TabKey }) {
  const heads = tab === "requests" ? ["Date", "Client", "Amount", "Agent", "Status", "Bank / invoice"]
    : tab === "deposits" || tab === "income" ? ["Date", "Client", "Gross", "Primary agent", "Second agent", "Affiliate"]
    : tab === "withdrawals" ? ["Date", "Client", "Amount", "Agent", "Status", "Affiliate"]
    : tab === "leads" ? ["Created", "Lead", "Source", "Agent", "Status", "Contact"]
    : ["Agent", "Team", "Status", "Leads", "FTDs", "Conversion", "Deposits", "Withdrawals"];
  return <tr>{heads.map((head) => <th key={head} className="px-4 py-3 font-medium">{head}</th>)}</tr>;
}

function TableRow({ tab, row, employeeName }: { tab: TabKey; row: Row; employeeName: (id?: string | null) => string }) {
  const td = "px-4 py-3 align-middle";
  if (tab === "requests") return <tr><td className={td}>{fmtDate(row.request_date)}</td><td className={`${td} font-medium`}>{row.client_name}</td><td className={`${td} num`}>{fmtMoney(toDisplay(row.amount, row.currency))}</td><td className={td}>{employeeName(row.employee_id)}</td><td className={td}><StatusBadge tone={statusTone(row.status)}>{DEPOSIT_REQUEST_STATUS_LABELS[row.status] ?? row.status}</StatusBadge></td><td className={td}>{row.invoice_no ? `#${row.invoice_no}` : "—"}</td></tr>;
  if (tab === "deposits" || tab === "income") return <tr><td className={td}>{fmtDate(row.date)}</td><td className={`${td} font-medium`}>{row.customer_name}</td><td className={`${td} num`}>{fmtMoney(toDisplay(row.amount, row.currency))}</td><td className={td}>{row.employees?.name ?? employeeName(row.employee_id)}</td><td className={td}>{row.employee2?.name ?? employeeName(row.employee_id_2)}</td><td className={td}>{row.affiliates?.name ?? "—"}</td></tr>;
  if (tab === "withdrawals") return <tr><td className={td}>{fmtDate(row.date)}</td><td className={`${td} font-medium`}>{row.customer_name}</td><td className={`${td} num`}>{fmtMoney(toDisplay(row.amount, row.currency))}</td><td className={td}>{row.employees?.name ?? employeeName(row.employee_id)}</td><td className={td}><StatusBadge tone={statusTone(row.status ?? "paid")}>{WITHDRAWAL_STATUS_LABELS[row.status ?? "paid"] ?? row.status}</StatusBadge></td><td className={td}>{row.affiliates?.name ?? "—"}</td></tr>;
  if (tab === "leads") return <tr><td className={td}>{fmtDate(row.created_at)}</td><td className={`${td} font-medium`}>{row.name}</td><td className={td}>{row.lead_sources?.name ?? "—"}</td><td className={td}>{row.employees?.name ?? employeeName(row.employee_id)}</td><td className={td}><StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge></td><td className={td}>{row.email || row.phone || "—"}</td></tr>;
  return <tr><td className={`${td} font-medium`}><Link to="/employees/$id" params={{ id: row.id }} className="text-primary hover:underline">{row.name}</Link></td><td className={td}>{row.team ?? "—"}</td><td className={td}><ActiveBadge active={!!row.active} /></td><td className={`${td} num`}>{row.leadCount}</td><td className={`${td} num`}>{row.ftdCount}</td><td className={`${td} num`}>{fmtPct(row.conversion)}</td><td className={`${td} num`}>{fmtMoney(row.depositTotal)}</td><td className={`${td} num`}>{fmtMoney(row.withdrawalTotal)}</td></tr>;
}