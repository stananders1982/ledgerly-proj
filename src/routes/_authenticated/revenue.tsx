import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, TrendingUp } from "lucide-react";
import { EmployeeLink } from "@/components/employee-link";
import { supabase } from "@/integrations/supabase/client";
import { IssueFilterBanner } from "@/components/issue-filter-banner";
import { useExporters } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDate, fmtMoney } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { SearchInput } from "@/components/search-input";
import { useTableToolbox, ColumnsMenu, FilterRow, TotalsRow } from "@/components/table-toolbox";
import { useSort, SortTh } from "@/components/sortable-table";

import { usePagination, TablePagination, PageSizeSelect } from "@/components/pagination";


import { useQuickCreate } from "@/lib/quick-create";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { useRowSelection } from "@/lib/row-selection";
import { BulkBar } from "@/components/bulk-bar";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanySettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/revenue")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.issue === "string" ? { issue: search.issue } : {}),
  }),
  head: () => ({ meta: [{ title: "Revenue — Ledgerly" }] }),
  component: RevenuePage,
});

function RevenuePage() {
  const { exportCSV, exportXLSX, exportPDF } = useExporters();
  const qc = useQueryClient();
  const settings = useCompanySettings();
  const [open, setOpen] = useState(false);
  useQuickCreate("revenue", () => setOpen(true));
  const [editing, setEditing] = useState<any | null>(null);
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");
  const { issue } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeRange = useMemo(

    () => getRange(range, { start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );

  const revQ = useQuery({
    queryKey: ["revenue-list"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("revenue")
        .select("*, employees:employee_id(name), employee2:employee_id_2(name), affiliates(name), leads(name, lead_sources(name))")
        .order("date", { ascending: false }));
      return data ?? [];
    },
  });
  const empQ = useQuery({ queryKey: ["employees-dir-any"], queryFn: async () => {
    const admin = await supabase.from("employees").select("id,name,active,team").order("name");
    if (!admin.error && (admin.data?.length ?? 0) > 0) return admin.data ?? [];
    const rpc = await supabase.rpc("list_employees_directory");
    return (rpc.data ?? []) as Array<{ id: string; name: string; active: boolean; team?: string | null }>;
  }});
  const affQ = useQuery({ queryKey: ["affiliates-dir-any"], queryFn: async () => {
    const admin = await supabase.from("affiliates").select("id,name,active").eq("active", true).order("name");
    if (!admin.error && (admin.data?.length ?? 0) > 0) return admin.data ?? [];
    const rpc = await supabase.rpc("list_affiliates_directory");
    return ((rpc.data ?? []) as Array<{ id: string; name: string; active: boolean }>).filter((a) => a.active);
  }});
  const activationsQ = useQuery({
    queryKey: ["activated-leads-picker"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("daily_lead_activations")
        .select("id, lead_name, employee_id, conversion_employee_id, daily_lead_entries(entry_date, lead_sources(name))")
        .not("lead_name", "is", null)
        .order("created_at", { ascending: false }));
      return (data ?? []) as any[];
    },
  });


  const employeeNameById = useMemo(
    () => new Map((empQ.data ?? []).map((e: any) => [e.id, e.name])),
    [empQ.data],
  );
  const affiliateNameById = useMemo(
    () => new Map((affQ.data ?? []).map((a: any) => [a.id, a.name])),
    [affQ.data],
  );

  const getEmployeeName = (id?: string | null, joined?: { name?: string } | null) =>
    joined?.name ?? (id ? employeeNameById.get(id) : undefined);
  const getAffiliateName = (id?: string | null, joined?: { name?: string } | null) =>
    joined?.name ?? (id ? affiliateNameById.get(id) : undefined);


  const filtered = useMemo(() => {
    const list = revQ.data ?? [];
    const s = activeRange.start.getTime();
    const e = activeRange.end.getTime();
    const term = search.trim().toLowerCase();
    return list.filter((r: any) => {
      if (issue === "revenue-no-method" && r.method) return false;
      if (issue === "revenue-no-agent" && r.employee_id) return false;
      if (issue) return true;
      if (!term) {
        const t = new Date(r.date + "T00:00:00").getTime();
        if (t < s || t > e) return false;
        return true;
      }
      return (r.customer_name ?? "").toLowerCase().includes(term);
    });
  }, [revQ.data, activeRange, search, issue]);

  const tb = useTableToolbox<any>(
    "revenue",
    [
      { key: "date", label: "Date", filter: "date", value: (r: any) => fmtDate(r.date) },
      { key: "customer", label: "Customer", value: (r: any) => r.customer_name ?? "" },
      { key: "amount", label: "Amount", value: (r: any) => r.amount },
      { key: "employee", label: "Employee", filter: "select", value: (r: any) => getEmployeeName(r.employee_id, r.employees) ?? "" },
      { key: "affiliate", label: "Affiliate", filter: "select", value: (r: any) => getAffiliateName(r.affiliate_id, r.affiliates) ?? "" },
    ],
    filtered,
  );

  const { sorted, sort, toggle } = useSort<any>(tb.filtered, {
    date: (r) => r.date,
    customer: (r) => r.customer_name,
    amount: (r) => Number(r.amount ?? 0),
    employee: (r) => getEmployeeName(r.employee_id, r.employees) ?? "",
    affiliate: (r) => getAffiliateName(r.affiliate_id, r.affiliates) ?? "",
  });
  const { pageItems, ...pg } = usePagination(sorted);


  const stats = useMemo(() => {
    const list = filtered;
    const total = list.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const allTotal = (revQ.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const byEmp = new Map<string, number>();
    const byAff = new Map<string, number>();
    list.forEach((r: any) => {
      const amt = Number(r.amount);
      const pct = Number(r.split_pct ?? 100);
      if (r.employee_id) {
        const n1 = getEmployeeName(r.employee_id, r.employees) ?? "?";
        byEmp.set(n1, (byEmp.get(n1) ?? 0) + amt * (pct / 100));
      }
      if (r.employee_id_2) {
        const n2 = getEmployeeName(r.employee_id_2, r.employee2) ?? "?";
        byEmp.set(n2, (byEmp.get(n2) ?? 0) + amt * ((100 - pct) / 100));
      }
      const aff = getAffiliateName(r.affiliate_id, r.affiliates);
      if (aff) byAff.set(aff, (byAff.get(aff) ?? 0) + amt);
    });
    return { total, allTotal, count: list.length, byEmp: [...byEmp.entries()].sort((a, b) => b[1] - a[1]), byAff: [...byAff.entries()].sort((a, b) => b[1] - a[1]) };
  }, [filtered, revQ.data, employeeNameById, affiliateNameById]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      let activationId: string | null = v.activation_id || null;

      // No client picked → create the client record from the details typed in
      // the dialog, so every deposit belongs to a client (and STDs can be seen).
      if (!activationId && v.new_client) {
        const name = String(v.customer_name ?? "").trim();
        const key = name.toLowerCase();
        const existing = (activationsQ.data ?? []).find(
          (a: any) => (a.lead_name ?? "").trim().toLowerCase() === key,
        );
        if (existing) {
          activationId = existing.id;
        } else {
          const { data, error } = await supabase
            .from("daily_lead_activations")
            .insert({
              lead_name: name,
              activation_date: v.new_client.activation_date,
              conversion_employee_id: v.new_client.conversion_employee_id || null,
              employee_id: v.new_client.employee_id,
              balance: settings.defaultActivationBalance,
            })
            .select("id")
            .single();
          if (error) throw error;
          activationId = data.id;
        }
      }

      const payload = {
        customer_name: v.customer_name,
        amount: Number(v.amount) || 0,
        date: v.date,
        affiliate_id: v.affiliate_id || null,
        employee_id: v.employee_id || null,
        employee_id_2: v.employee_id_2 || null,
        split_pct: v.employee_id_2 ? (Number(v.split_pct) || 50) : 100,
        notes: v.notes || null,
        method: v.method || null,
        method_provider: v.method_provider || null,
        // Direct link to the client record, so renaming a client keeps history intact.
        activation_id: activationId,
      };
      const { error } = v.id
        ? await supabase.from("revenue").update(payload).eq("id", v.id)
        : await supabase.from("revenue").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["revenue-list"] }); qc.invalidateQueries({ queryKey: ["revenue"] }); qc.invalidateQueries({ queryKey: ["activated-leads-picker"] }); qc.invalidateQueries({ queryKey: ["activations"] }); toast.success("Saved"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("revenue").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["revenue-list"] }); toast.success("Deleted"); },
  });

  const sel = useRowSelection<any>(filtered);

  const selectedTotal = sel.selectedRows.reduce((a: number, r: any) => a + Number(r.amount || 0), 0);

  const bulkDelete = useMutation({
    mutationFn: async () => {
      if (!sel.ids.length) return 0;
      const { error } = await supabase.from("revenue").delete().in("id", sel.ids);
      if (error) throw error;
      return sel.ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["revenue-list"] });
      sel.clear();
      if (count) toast.success(`Deleted ${count} record${count === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkAssign = useMutation({
    mutationFn: async (employeeId: string) => {
      if (!sel.ids.length) return 0;
      const { error } = await supabase.from("revenue").update({ employee_id: employeeId }).in("id", sel.ids);
      if (error) throw error;
      return sel.ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["revenue-list"] });
      sel.clear();
      if (count) toast.success(`Reassigned ${count} record${count === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkMethod = useMutation({
    mutationFn: async (method: string) => {
      if (!sel.ids.length) return 0;
      const { error } = await supabase.from("revenue").update({ method }).in("id", sel.ids);
      if (error) throw error;
      return sel.ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["revenue-list"] });
      sel.clear();
      if (count) toast.success(`Updated ${count} record${count === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportSelection = () =>
    exportCSV(
      sel.selectedRows.map((r: any) => ({
        Date: r.date,
        Customer: r.customer_name,
        Amount: r.amount,
        Method: r.method ?? "",
        Employee: getEmployeeName(r.employee_id, r.employees) ?? "",
      })),
      "revenue-selection",
    );

  const handleExport = (type: "csv" | "xlsx" | "pdf") => {
    const rows = filtered.map((r: any) => ({
      Date: r.date, Customer: r.customer_name, Amount: r.amount,
      Employee: getEmployeeName(r.employee_id, r.employees) ?? "",
      Affiliate: getAffiliateName(r.affiliate_id, r.affiliates) ?? "",
    }));
    if (!rows.length) return toast.error("Nothing to export");
    if (type === "csv") exportCSV(rows, "revenue");
    else if (type === "xlsx") exportXLSX(rows, "revenue", "Revenue");
    else exportPDF("Revenue", rows, "revenue");
  };

  return (
    <div>
      <PageHeader
        title="Revenue"
        description="Every sale, attributed to a closer and an acquisition source."
        actions={
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline"><Download className="h-4 w-4" /> Export</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New revenue</Button></DialogTrigger>
              <RevenueDialog key={editing?.id ?? "new"} rev={editing} employees={empQ.data ?? []} affiliates={affQ.data ?? []} activations={activationsQ.data ?? []} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
            </Dialog>
          </div>
        }
      />

      {issue && (
        <IssueFilterBanner
          issue={issue}
          count={filtered.length}
          onClear={() => navigate({ search: (prev: any) => ({ ...prev, issue: undefined }), replace: true })}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangePicker
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search client…" />
        

      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label={activeRange.label} value={fmtMoney(stats.total)} tone="positive" />
        <StatCard label="All-time revenue" value={fmtMoney(stats.allTotal)} />
        <StatCard label="Transactions" value={String(stats.count)} />
        <StatCard label="Avg deal" value={fmtMoney(stats.count ? stats.total / stats.count : 0)} />
      </section>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <BreakdownCard title="Revenue by employee" rows={stats.byEmp} />
        <BreakdownCard title="Revenue by affiliate" rows={stats.byAff} />
      </div>

      <BulkBar count={sel.count} noun="record" summary={fmtMoney(selectedTotal)} onClear={sel.clear}>
        <Select onValueChange={(v) => bulkAssign.mutate(v)}>
          <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Set employee" /></SelectTrigger>
          <SelectContent>
            {(empQ.data ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select onValueChange={(v) => bulkMethod.mutate(v)}>
          <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Set method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="wire">Wire</SelectItem>
            <SelectItem value="crypto">Crypto</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={exportSelection}>Export selection</Button>
        <ConfirmDelete onConfirm={() => bulkDelete.mutate()} label={`Delete ${sel.count} selected record(s)?`} />
      </BulkBar>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <PageSizeSelect value={pg.perPage} onChange={pg.setPerPage} />
        <ColumnsMenu tb={tb} />
      </div>

      <div className="card-surface overflow-hidden">
        {revQ.isLoading ? <TableSkeleton cols={6} />
        : filtered.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No revenue in this range" description="Try a different time frame or record a new sale."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New revenue</Button>} />
        ) : (
          <>
          <DataCardList>
            {pageItems.map((r: any) => (
              <DataCard
                key={r.id}
                title={r.customer_name}
                subtitle={fmtDate(r.date)}
                onClick={() => { setEditing(r); setOpen(true); }}
                actions={<ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete revenue?" />}
                fields={[
                  { label: "Amount", value: <span className="num text-primary font-medium">{fmtMoney(r.amount)}</span> },
                  { label: "Employee", value: getEmployeeName(r.employee_id, r.employees) || "—" },
                  { label: "Affiliate", value: getAffiliateName(r.affiliate_id, r.affiliates) || "—" },
                ]}
              />
            ))}
          </DataCardList>
          <div className="hidden md:block overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4 w-8">
                    <Checkbox
                      checked={pageItems.length > 0 && pageItems.every((r: any) => sel.selected.has(r.id))}
                      onCheckedChange={() => sel.toggleAll(pageItems.map((r: any) => r.id))}
                      aria-label="Select all records on this page"
                    />
                  </th>
                  {tb.show("date") && <SortTh label="Date" k="date" sort={sort} toggle={toggle} className="py-3 px-4" />}
                  {tb.show("customer") && <SortTh label="Customer" k="customer" sort={sort} toggle={toggle} className="py-3 px-4" />}
                  {tb.show("amount") && <SortTh label="Amount" k="amount" sort={sort} toggle={toggle} className="py-3 px-4" />}
                  {tb.show("employee") && <SortTh label="Employee" k="employee" sort={sort} toggle={toggle} className="py-3 px-4" />}
                  {tb.show("affiliate") && <SortTh label="Affiliate" k="affiliate" sort={sort} toggle={toggle} className="py-3 px-4" />}
                  <th className="py-3 px-4"></th>
                </tr>
                <FilterRow tb={tb} leading={1} trailing={1} />
              </thead>
              <tbody>
                {pageItems.map((r: any) => (
                  <RevenueRow
                    key={r.id}
                    revenue={r}
                    employeeName={getEmployeeName(r.employee_id, r.employees)}
                    employee2Name={getEmployeeName(r.employee_id_2, r.employee2)}
                    affiliateName={getAffiliateName(r.affiliate_id, r.affiliates)}
                    affiliateId={r.affiliate_id}
                    onEdit={() => { setEditing(r); setOpen(true); }}
                    onDelete={() => del.mutate(r.id)}
                    selected={sel.selected.has(r.id)}
                    onToggleSelect={() => sel.toggle(r.id)}
                    show={tb.show}
                  />
                ))}
              </tbody>
              <TotalsRow
                tb={tb}
                rows={pageItems as any[]}
                leading={1}
                trailing={1}
                totals={{ amount: (r: any) => Number(r.amount || 0) }}
                format={(n) => fmtMoney(n)}
                label="Page total"
              />
            </table>
          </div>
          <TablePagination {...pg} />
          </>
        )}
      </div>
    </div>
  );
}

function RevenueRow({
  revenue: r,
  employeeName,
  employee2Name,
  affiliateName,
  affiliateId,
  onEdit,
  onDelete,
  selected,
  onToggleSelect,
  show,
}: {
  revenue: any;
  employeeName?: string;
  employee2Name?: string;
  affiliateName?: string;
  affiliateId?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  show: (key: string) => boolean;
}) {
  return (
                  <tr key={r.id} className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                      onClick={onEdit}>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={!!selected} onCheckedChange={() => onToggleSelect?.()} aria-label="Select record" />
                    </td>
                    {show("date") && (
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(r.date)}</td>
                    )}
                    {show("customer") && (
                    <td className="py-3 px-4 font-medium">{r.customer_name}</td>
                    )}
                    {show("amount") && (
                    <td className="py-3 px-4 text-primary font-medium">{fmtMoney(r.amount)}</td>
                    )}
                    {show("employee") && (
                    <td className="py-3 px-4">
                      <EmployeeLink id={r.employee_id} name={employeeName} />
                      {r.employee_id_2 && (
                        <span className="text-muted-foreground">
                          {" "}({Number(r.split_pct)}%) + <EmployeeLink id={r.employee_id_2} name={employee2Name} /> ({100 - Number(r.split_pct)}%)
                        </span>
                      )}
                    </td>
                    )}
                    {show("affiliate") && (
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      {affiliateId ? (
                        <Link to="/affiliates/$id" params={{ id: affiliateId }} className="text-primary hover:underline">
                          {affiliateName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{affiliateName || "—"}</span>
                      )}
                    </td>
                    )}
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <ConfirmDelete onConfirm={onDelete} label="Delete revenue?" />
                    </td>
                  </tr>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="card-surface p-5">
      <h3 className="font-display text-base font-semibold mb-3">{title}</h3>
      {rows.length === 0 ? <div className="text-sm text-muted-foreground">No data</div> : (
        <div className="space-y-2">
          {rows.slice(0, 6).map(([k, v]) => (
            <div key={k}>
              <div className="flex justify-between text-xs"><span>{k}</span><span className="text-muted-foreground">{fmtMoney(v)}</span></div>
              <div className="h-1.5 rounded-full bg-accent/40 mt-1 overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RevenueDialog({
  rev, employees, affiliates, activations, onSubmit, loading,
}: { rev: any; employees: any[]; affiliates: any[]; activations: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: rev?.id,
    customer_name: rev?.customer_name ?? "",
    amount: rev?.amount ?? "",
    date: rev?.date ?? new Date().toISOString().slice(0, 10),
    affiliate_id: rev?.affiliate_id ?? "",
    employee_id: rev?.employee_id ?? "",
    employee_id_2: rev?.employee_id_2 ?? "",
    split_pct: rev?.split_pct ?? 50,
    notes: rev?.notes ?? "",
    activation_id: rev?.activation_id ?? "",
    method: rev?.method ?? "",
    method_provider: rev?.method_provider ?? "",
  }));
  const hasSplit = !!form.employee_id_2;
  const [activationId, setActivationId] = useState(rev?.activation_id ?? "");
  const [manual, setManual] = useState(false);
  const picked = activations.find((x: any) => x.id === activationId);
  const detailsHidden = !!picked && !manual;

  // New-client details, asked for when no existing client is selected.
  const [newClient, setNewClient] = useState(() => ({
    activation_date: rev?.date ?? new Date().toISOString().slice(0, 10),
    conversion_employee_id: "",
    employee_id: "",
  }));
  const typedName = String(form.customer_name ?? "").trim().toLowerCase();
  const nameMatch = activations.find(
    (a: any) => (a.lead_name ?? "").trim().toLowerCase() === typedName && typedName,
  );
  // New or existing deposit: if nothing links it to a client, collect the details.
  const needsNewClient = !activationId && !nameMatch;
  const newClientValid =
    !needsNewClient ||
    (!!form.customer_name.trim() && !!newClient.activation_date && !!newClient.conversion_employee_id && !!newClient.employee_id);

  const pickActivation = (id: string) => {
    if (id === "_none") { setActivationId(""); setForm((f) => ({ ...f, activation_id: "" })); return; }
    setActivationId(id);
    setManual(false);
    const a = activations.find((x) => x.id === id);
    if (!a) return;
    const sourceName = a.daily_lead_entries?.lead_sources?.name;
    const aff = sourceName ? affiliates.find((f: any) => f.name === sourceName) : undefined;
    setForm((f) => ({
      ...f,
      activation_id: a.id,
      customer_name: a.lead_name ?? f.customer_name,
      employee_id: a.employee_id || f.employee_id,
      affiliate_id: aff?.id ?? f.affiliate_id,
      date: a.daily_lead_entries?.entry_date ?? f.date,
    }));
  };
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{rev?.id ? "Edit revenue" : "Record revenue"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Pick from activated leads (optional)">
          <Select value={activationId || "_none"} onValueChange={pickActivation}>
            <SelectTrigger><SelectValue placeholder={activations.length ? "Search activated lead" : "No activated leads yet"} /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="_none">None</SelectItem>
              {activations.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.lead_name}
                  {a.daily_lead_entries?.lead_sources?.name ? ` · ${a.daily_lead_entries.lead_sources.name}` : ""}
                  {a.daily_lead_entries?.entry_date ? ` · ${a.daily_lead_entries.entry_date}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {detailsHidden ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{form.customer_name || "—"}</span>
              <Button variant="ghost" size="sm" onClick={() => setManual(true)}>Edit details</Button>
            </div>
            <div className="text-muted-foreground text-xs">
              {[
                affiliates.find((a: any) => a.id === form.affiliate_id)?.name,
                employees.find((e: any) => e.id === form.employee_id)?.name,
                form.date,
              ].filter(Boolean).join(" · ") || "No linked details"}
            </div>
          </div>
        ) : (
          <Field label="Customer name"><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></Field>
        )}

        {!activationId && nameMatch && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Matches existing client <span className="font-medium text-foreground">{nameMatch.lead_name}</span>
            {nameMatch.activation_date ? ` · activated ${nameMatch.activation_date}` : ""} — this deposit will be linked to that client on save.
          </div>
        )}

        {needsNewClient && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 grid gap-3">
            <div>
              <p className="text-sm font-medium">New client</p>
              <p className="text-xs text-muted-foreground">
                No client record matches this name — fill these in and one will be created.
              </p>
            </div>
            <Field label="Date of activation">
              <Input
                type="date"
                value={newClient.activation_date}
                onChange={(e) => setNewClient({ ...newClient, activation_date: e.target.value })}
              />
            </Field>
            <Field label="Conversion agent (Team C)">
              <Select
                value={newClient.conversion_employee_id}
                onValueChange={(v) => setNewClient({ ...newClient, conversion_employee_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Pick agent" /></SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((e: any) => (e.team ?? "C") === "C")
                    .map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Retention agent (Team R)">
              <Select
                value={newClient.employee_id}
                onValueChange={(v) => setNewClient({ ...newClient, employee_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Pick agent" /></SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((e: any) => (e.team ?? "R") === "R")
                    .map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        <div className={detailsHidden ? "" : "grid grid-cols-2 gap-3"}>
          <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          {!detailsHidden && (
            <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          )}
        </div>
        {!detailsHidden && (
          <Field label={hasSplit ? `Employee 1 (${Number(form.split_pct)}%)` : "Employee"}>
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}

        <Field label={hasSplit ? `Employee 2 (${100 - Number(form.split_pct)}%)` : "Split with second employee (optional)"}>
          <Select
            value={form.employee_id_2 || "_none"}
            onValueChange={(v) => setForm({ ...form, employee_id_2: v === "_none" ? "" : v })}
          >
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {employees.filter((e) => e.id !== form.employee_id).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {hasSplit && (
          <Field label={`Split: Employee 1 gets ${Number(form.split_pct)}%`}>
            <Input
              type="range" min={1} max={99} step={1}
              value={form.split_pct}
              onChange={(e) => setForm({ ...form, split_pct: Number(e.target.value) })}
            />
          </Field>
        )}
        {!detailsHidden && (
          <Field label="Affiliate (optional)">
            <Select value={form.affiliate_id} onValueChange={(v) => setForm({ ...form, affiliate_id: v })}>
              <SelectTrigger><SelectValue placeholder={affiliates.length ? "Pick affiliate" : "No affiliates yet"} /></SelectTrigger>
              <SelectContent>{affiliates.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}

        <Field label="Method">
          <Select
            value={form.method || "_none"}
            onValueChange={(v) => setForm({ ...form, method: v === "_none" ? "" : v })}
          >
            <SelectTrigger><SelectValue placeholder="Pick method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="wire">Wire</SelectItem>
              <SelectItem value="crypto">Crypto</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Method solution name">
          <Input
            value={form.method_provider}
            placeholder="e.g. Stripe, Bank of Cyprus"
            onChange={(e) => setForm({ ...form, method_provider: e.target.value })}
          />
        </Field>

        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      {rev?.id && (
        <div className="grid gap-4 border-t border-border pt-4">
          <AttachmentsPanel entityType="revenue" entityId={rev.id} />
          <CommentThread entityType="revenue" entityId={rev.id} />
        </div>
      )}

      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              ...form,
              activation_id: form.activation_id || nameMatch?.id || "",
              new_client: needsNewClient ? newClient : null,
            })
          }
          disabled={loading || !form.customer_name || !form.amount || !newClientValid}
        >
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
