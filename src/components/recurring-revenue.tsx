/**
 * Recurring income — retainers and subscriptions that bill on a schedule.
 * Mirrors the recurring expense engine so both sides of the ledger repeat.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Repeat } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
const METHODS = ["card", "wire", "crypto"] as const;

function monthlyEquiv(amount: number, freq: string) {
  switch (freq) {
    case "weekly": return (amount * 52) / 12;
    case "monthly": return amount;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    default: return amount;
  }
}

export function RecurringRevenueTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => {
    import("@/lib/recurring-run")
      .then(({ runDueRecurringRevenue }) => runDueRecurringRevenue())
      .then((res) => {
        if (res?.count > 0) {
          toast.success(`Generated ${res.count} due income record${res.count === 1 ? "" : "s"}`);
          qc.invalidateQueries({ queryKey: ["recurring-revenue"] });
          qc.invalidateQueries({ queryKey: ["revenue-list"] });
        }
      })
      .catch(() => {
        /* generation is best-effort */
      });
  }, [qc]);

  const listQ = useQuery({
    queryKey: ["recurring-revenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_revenue")
        .select("*, employees(name), affiliates(name)")
        .order("next_due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const empQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => (await supabase.rpc("list_employees_directory")).data ?? [],
  });
  const affQ = useQuery({
    queryKey: ["affiliates-directory"],
    queryFn: async () => (await supabase.rpc("list_affiliates_directory")).data ?? [],
  });

  const stats = useMemo(() => {
    const list = (listQ.data ?? []).filter((r: any) => r.active);
    const monthly = list.reduce((s: number, r: any) => s + monthlyEquiv(Number(r.amount), r.frequency), 0);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const upcoming = list
      .filter((r: any) => r.next_due_date && new Date(r.next_due_date) <= in30)
      .reduce((s: number, r: any) => s + Number(r.amount), 0);
    return { monthly, upcoming, count: list.length };
  }, [listQ.data]);

  const { sorted, sort, toggle } = useSort<any>((listQ.data ?? []) as any[], {
    name: (r) => r.name ?? "",
    customer: (r) => r.customer_name ?? "",
    amount: (r) => Number(r.amount ?? 0),
    frequency: (r) => r.frequency ?? "",
    next: (r) => r.next_due_date ?? "",
    status: (r) => !!r.active,
  });
  const { pageItems, ...pg } = usePagination(sorted, 30);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        customer_name: v.customer_name || null,
        amount: Number(v.amount) || 0,
        frequency: v.frequency,
        start_date: v.start_date,
        end_date: v.end_date || null,
        next_due_date: v.next_due_date,
        employee_id: v.employee_id || null,
        affiliate_id: v.affiliate_id || null,
        method: v.method || null,
        method_provider: v.method_provider || null,
        active: !!v.active,
        notes: v.notes || null,
      };
      const { error } = v.id
        ? await supabase.from("recurring_revenue").update(payload).eq("id", v.id)
        : await supabase.from("recurring_revenue").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-revenue"] });
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_revenue").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-revenue"] });
      toast.success("Deleted");
    },
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { runDueRecurringRevenue } = await import("@/lib/recurring-run");
      return (await runDueRecurringRevenue()).count;
    },
    onSuccess: (n) => {
      toast.success(`Generated ${n ?? 0} income record${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["recurring-revenue"] });
      qc.invalidateQueries({ queryKey: ["revenue-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
          <RefreshCw className="h-4 w-4" /> Run now
        </Button>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New recurring income</Button></DialogTrigger>
          <RecurringRevenueDialog
            key={editing?.id ?? "new"}
            item={editing}
            employees={(empQ.data ?? []) as any[]}
            affiliates={(affQ.data ?? []) as any[]}
            onSubmit={(v) => upsert.mutate(v)}
            loading={upsert.isPending}
          />
        </Dialog>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Active retainers" value={String(stats.count)} icon={Repeat} />
        <StatCard label="Monthly equivalent" value={fmtMoney(stats.monthly)} tone="positive" />
        <StatCard label="Due next 30 days" value={fmtMoney(stats.upcoming)} />
      </section>

      <div className="card-surface overflow-hidden">
        {listQ.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : (listQ.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No recurring income"
            description="Add retainers, subscriptions or managed-account fees that bill on a schedule."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New recurring income</Button>}
          />
        ) : (
          <>
            <DataCardList>
              {pageItems.map((r: any) => (
                <DataCard
                  key={r.id}
                  title={r.name}
                  subtitle={r.customer_name ?? undefined}
                  onClick={() => { setEditing(r); setOpen(true); }}
                  actions={<ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete recurring income?" />}
                  fields={[
                    { label: "Amount", value: fmtMoney(r.amount) },
                    { label: "Frequency", value: <span className="capitalize">{r.frequency}</span> },
                    { label: "Next due", value: fmtDate(r.next_due_date) },
                    { label: "Status", value: <StatusBadge tone={r.active ? "success" : "muted"}>{r.active ? "Active" : "Paused"}</StatusBadge> },
                  ]}
                />
              ))}
            </DataCardList>
            <div className="hidden overflow-x-auto scroll-slim md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-head border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <SortTh label="Name" k="name" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <SortTh label="Client" k="customer" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <SortTh label="Amount" k="amount" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <SortTh label="Frequency" k="frequency" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <SortTh label="Next due" k="next" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <th className="py-3 px-4">Agent</th>
                    <SortTh label="Status" k="status" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r: any) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/30"
                      onClick={() => { setEditing(r); setOpen(true); }}
                    >
                      <td className="py-3 px-4 font-medium">{r.name}</td>
                      <td className="py-3 px-4">{r.customer_name || "—"}</td>
                      <td className="py-3 px-4 font-medium text-primary">{fmtMoney(r.amount)}</td>
                      <td className="py-3 px-4 capitalize text-muted-foreground">{r.frequency}</td>
                      <td className="py-3 px-4 text-muted-foreground">{fmtDate(r.next_due_date)}</td>
                      <td className="py-3 px-4 text-muted-foreground">{r.employees?.name || "—"}</td>
                      <td className="py-3 px-4">
                        <StatusBadge tone={r.active ? "success" : "muted"}>{r.active ? "Active" : "Paused"}</StatusBadge>
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                        <ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete recurring income?" />
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

function RecurringRevenueDialog({
  item, employees, affiliates, onSubmit, loading,
}: {
  item: any;
  employees: any[];
  affiliates: any[];
  onSubmit: (v: any) => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => ({
    id: item?.id,
    name: item?.name ?? "",
    customer_name: item?.customer_name ?? "",
    amount: item?.amount ?? "",
    frequency: item?.frequency ?? "monthly",
    start_date: item?.start_date ?? today,
    end_date: item?.end_date ?? "",
    next_due_date: item?.next_due_date ?? today,
    employee_id: item?.employee_id ?? "",
    affiliate_id: item?.affiliate_id ?? "",
    method: item?.method ?? "",
    method_provider: item?.method_provider ?? "",
    active: item?.active ?? true,
    notes: item?.notes ?? "",
  }));
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{item ? "Edit recurring income" : "New recurring income"}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 py-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Monthly retainer — Acme" />
        </div>
        <div>
          <Label>Client name</Label>
          <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
        </div>
        <div>
          <Label>Amount</Label>
          <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
        </div>
        <div>
          <Label>Frequency</Label>
          <Select value={form.frequency} onValueChange={(v) => set("frequency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Next due date</Label>
          <Input type="date" value={form.next_due_date} onChange={(e) => set("next_due_date", e.target.value)} />
        </div>
        <div>
          <Label>Start date</Label>
          <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </div>
        <div>
          <Label>End date (optional)</Label>
          <Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
        </div>
        <div>
          <Label>Agent</Label>
          <Select value={form.employee_id || "none"} onValueChange={(v) => set("employee_id", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Affiliate</Label>
          <Select value={form.affiliate_id || "none"} onValueChange={(v) => set("affiliate_id", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {affiliates.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Method</Label>
          <Select value={form.method || "none"} onValueChange={(v) => set("method", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Method provider</Label>
          <Input value={form.method_provider} onChange={(e) => set("method_provider", e.target.value)} placeholder="e.g. Stripe" />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} id="rr-active" />
          <Label htmlFor="rr-active">Active</Label>
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.name || !form.amount}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}
