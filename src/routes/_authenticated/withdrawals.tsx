import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Banknote } from "lucide-react";
import { EmployeeLink } from "@/components/employee-link";
import { supabase } from "@/integrations/supabase/client";
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
import { SearchInput } from "@/components/search-input";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";
import { withdrawalPenalty } from "@/lib/rules";

const sb = supabase as any;


export const Route = createFileRoute("/_authenticated/withdrawals")({
  head: () => ({ meta: [{ title: "Withdrawals — Ledgerly" }] }),
  component: WithdrawalsPage,
});

function WithdrawalsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const wQ = useQuery({
    queryKey: ["withdrawals-list"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("withdrawals")
        .select("*, employees:employee_id(name), employee2:employee_id_2(name), affiliates:affiliate_id(name), revenue:revenue_id(customer_name, amount, date)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const empQ = useQuery({ queryKey: ["employees-dir-any"], queryFn: async () => {
    const admin = await supabase.from("employees").select("id,name,active").order("name");
    if (!admin.error && (admin.data?.length ?? 0) > 0) return admin.data ?? [];
    const rpc = await supabase.rpc("list_employees_directory");
    return (rpc.data ?? []) as Array<{ id: string; name: string; active: boolean }>;
  }});
  const affQ = useQuery({ queryKey: ["affiliates-dir-any"], queryFn: async () => {
    const admin = await supabase.from("affiliates").select("id,name,active").order("name");
    if (!admin.error && (admin.data?.length ?? 0) > 0) return admin.data ?? [];
    const rpc = await supabase.rpc("list_affiliates_directory");
    return (rpc.data ?? []) as Array<{ id: string; name: string; active: boolean }>;
  }});
  const revQ = useQuery({
    queryKey: ["revenue-min"],
    queryFn: async () => await fetchAll(() => supabase.from("revenue").select("id,customer_name,amount,date,employee_id,affiliate_id").order("date", { ascending: false })),
  });

  const empNameById = useMemo(
    () => new Map((empQ.data ?? []).map((e: any) => [e.id, e.name])),
    [empQ.data],
  );
  const getEmpName = (r: any) => r.employees?.name ?? (r.employee_id ? empNameById.get(r.employee_id) : undefined) ?? "—";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = wQ.data ?? [];
    if (!term) return list;
    return list.filter((r: any) => (r.customer_name ?? "").toLowerCase().includes(term));
  }, [wQ.data, search]);

  const { sorted, sort, toggle } = useSort<any>(rows, {
    date: (r) => r.date,
    customer: (r) => r.customer_name ?? "",
    amount: (r) => Number(r.amount ?? 0),
    agent: (r) => getEmpName(r),
    penalty: (r) => Number(r.employee_penalty ?? 0),
    source: (r) => r.affiliates?.name ?? "",
    sale: (r) => r.revenue?.customer_name ?? "",
  });
  const { pageItems, ...pg } = usePagination(sorted, 30);

  const stats = useMemo(() => {
    const list = wQ.data ?? [];
    const total = list.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const month = new Date().toISOString().slice(0, 7);
    const monthTotal = list.filter((r: any) => r.date?.startsWith(month)).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const penalty = list.reduce((s: number, r: any) => s + Number(r.employee_penalty), 0);
    const byEmp = new Map<string, number>();
    list.forEach((r: any) => {
      const totalPenalty = Number(r.employee_penalty) || 0;
      const pct = Number(r.split_pct ?? 100) / 100;
      if (r.employee_id) {
        const n = r.employees?.name ?? empNameById.get(r.employee_id) ?? "?";
        byEmp.set(n, (byEmp.get(n) ?? 0) + totalPenalty * (r.employee_id_2 ? pct : 1));
      }
      if (r.employee_id_2) {
        const n = r.employee2?.name ?? empNameById.get(r.employee_id_2) ?? "?";
        byEmp.set(n, (byEmp.get(n) ?? 0) + totalPenalty * (1 - pct));
      }
    });
    return { total, monthTotal, count: list.length, penalty, byEmp: [...byEmp.entries()].sort((a, b) => b[1] - a[1]) };
  }, [wQ.data, empNameById]);


  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const amount = Number(v.amount) || 0;
      const payload = {
        revenue_id: v.revenue_id || null,
        customer_name: v.customer_name,
        employee_id: v.employee_id || null,
        employee_id_2: v.employee_id_2 || null,
        split_pct: v.employee_id_2 ? (Number(v.split_pct) || 50) : 100,
        affiliate_id: v.affiliate_id || null,
        amount,
        employee_penalty: +withdrawalPenalty(amount).toFixed(2),
        date: v.date,
        notes: v.notes || null,
      };
      const { error } = v.id
        ? await sb.from("withdrawals").update(payload).eq("id", v.id)
        : await sb.from("withdrawals").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["withdrawals-list"] }); toast.success("Saved"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await sb.from("withdrawals").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["withdrawals-list"] }); toast.success("Deleted"); },
  });

  return (
    <div>
      <PageHeader
        title="Withdrawals"
        description="Record customer withdrawals. 10% of each amount is deducted from the sales agent."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New withdrawal</Button></DialogTrigger>
            <WithdrawalDialog
              key={editing?.id ?? "new"}
              row={editing}
              employees={empQ.data ?? []}
              affiliates={affQ.data ?? []}
              revenues={revQ.data ?? []}
              onSubmit={(v) => upsert.mutate(v)}
              loading={upsert.isPending}
            />
          </Dialog>
        }
      />

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search client…" />
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total withdrawn" value={fmtMoney(stats.total)} tone="negative" />
        <StatCard label="This month" value={fmtMoney(stats.monthTotal)} />
        <StatCard label="Withdrawals" value={String(stats.count)} />
        <StatCard label="Agent penalties (10%)" value={fmtMoney(stats.penalty)} />
      </section>

      {stats.byEmp.length > 0 && (
        <div className="card-surface p-5 mb-6">
          <h3 className="font-display text-base font-semibold mb-3">Penalty per agent</h3>
          <div className="space-y-2">
            {stats.byEmp.map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span>{k}</span><span className="text-destructive font-medium">−{fmtMoney(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-surface overflow-hidden">
        {wQ.isLoading ? <TableSkeleton cols={7} />
        : rows.length === 0 ? (
          <EmptyState icon={Banknote} title="No withdrawals yet" description="Record your first withdrawal to track payouts and agent penalties."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New withdrawal</Button>} />
        ) : (
          <>
          <DataCardList>
            {pageItems.map((r: any) => (
              <DataCard
                key={r.id}
                title={r.customer_name}
                subtitle={fmtDate(r.date)}
                onClick={() => { setEditing(r); setOpen(true); }}
                actions={<ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete withdrawal?" />}
                fields={[
                  { label: "Amount", value: <span className="num text-destructive font-medium">−{fmtMoney(r.amount)}</span> },
                  { label: "Agent", value: getEmpName(r) },
                  { label: "Penalty", value: <span className="num text-destructive">−{fmtMoney(r.employee_penalty)}</span> },
                  { label: "Source", value: r.affiliates?.name ?? "—" },
                ]}
              />
            ))}
          </DataCardList>
          <div className="hidden md:block overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <SortTh label="Date" k="date" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Customer" k="customer" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Amount" k="amount" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Agent" k="agent" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Penalty (10%)" k="penalty" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Source" k="source" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Linked sale" k="sale" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(r); setOpen(true); }}>
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(r.date)}</td>
                    <td className="py-3 px-4 font-medium">{r.customer_name}</td>
                    <td className="py-3 px-4 text-destructive font-medium">−{fmtMoney(r.amount)}</td>
                    <td className="py-3 px-4">
                      <EmployeeLink id={r.employee_id} name={getEmpName(r)} />
                      {r.employee_id_2 && (
                        <span className="text-xs text-muted-foreground">
                          {" "}({Number(r.split_pct)}%) + <EmployeeLink id={r.employee_id_2} name={r.employee2?.name ?? empNameById.get(r.employee_id_2) ?? "—"} /> ({100 - Number(r.split_pct)}%)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-destructive">−{fmtMoney(r.employee_penalty)}</td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      {r.affiliate_id ? (
                        <Link to="/affiliates/$id" params={{ id: r.affiliate_id }} className="text-primary hover:underline">
                          {r.affiliates?.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{r.affiliates?.name ?? "—"}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {r.revenue ? `${r.revenue.customer_name} · ${fmtMoney(r.revenue.amount)}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete withdrawal?" />
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

function WithdrawalDialog({
  row, employees, affiliates, revenues, onSubmit, loading,
}: { row: any; employees: any[]; affiliates: any[]; revenues: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: row?.id,
    revenue_id: row?.revenue_id ?? "",
    customer_name: row?.customer_name ?? "",
    employee_id: row?.employee_id ?? "",
    employee_id_2: row?.employee_id_2 ?? "",
    split_pct: row?.split_pct ?? 50,
    affiliate_id: row?.affiliate_id ?? "",
    amount: row?.amount ?? "",
    date: row?.date ?? new Date().toISOString().slice(0, 10),
    notes: row?.notes ?? "",
  }));

  const penaltyPreview = withdrawalPenalty(form.amount);
  const hasSplit = !!form.employee_id_2;

  const onPickRevenue = (id: string) => {
    if (id === "_none") {
      setForm({ ...form, revenue_id: "" });
      return;
    }
    const r = revenues.find((x) => x.id === id);
    setForm({
      ...form,
      revenue_id: id,
      customer_name: r?.customer_name ?? form.customer_name,
      employee_id: r?.employee_id ?? form.employee_id,
      affiliate_id: r?.affiliate_id ?? form.affiliate_id,
      amount: r?.amount ?? form.amount,
    });
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{row?.id ? "Edit withdrawal" : "Record withdrawal"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Linked sale (optional — autofills fields)">
          <Select value={form.revenue_id || "_none"} onValueChange={onPickRevenue}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {revenues.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.customer_name} · {fmtMoney(r.amount)} · {fmtDate(r.date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Customer name"><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        </div>
        <Field label={hasSplit ? `Sales agent 1 (${Number(form.split_pct)}%)` : "Sales agent"}>
          <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pick agent" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={hasSplit ? `Sales agent 2 (${100 - Number(form.split_pct)}%)` : "Split with second agent (optional)"}>
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
          <Field label={`Split: Agent 1 gets ${Number(form.split_pct)}%`}>
            <Input
              type="range" min={1} max={99} step={1}
              value={form.split_pct}
              onChange={(e) => setForm({ ...form, split_pct: Number(e.target.value) })}
            />
          </Field>
        )}
        <Field label="Source (affiliate)">
          <Select
            value={form.affiliate_id || "_none"}
            onValueChange={(v) => setForm({ ...form, affiliate_id: v === "_none" ? "" : v })}
          >
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {affiliates.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="rounded-md border border-border bg-accent/30 px-3 py-2 text-xs text-muted-foreground">
          Agent penalty (10%): <span className="text-destructive font-medium">−{fmtMoney(penaltyPreview)}</span>
          {hasSplit && <span> · split {Number(form.split_pct)}% / {100 - Number(form.split_pct)}%</span>}
        </div>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.customer_name || !form.amount}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
