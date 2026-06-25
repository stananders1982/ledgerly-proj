import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Repeat, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtDate, fmtMoney } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/recurring")({
  head: () => ({ meta: [{ title: "Recurring Expenses — Ledgerly" }] }),
  component: RecurringPage,
});

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;

function monthlyEquiv(amount: number, freq: string) {
  switch (freq) {
    case "weekly": return amount * 52 / 12;
    case "monthly": return amount;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    default: return amount;
  }
}

function RecurringPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  // Auto-generate due entries on page load
  useEffect(() => {
    import("@/lib/recurring.functions").then(({ generateDueRecurringExpenses }) =>
      generateDueRecurringExpenses().then((res) => {
        if (res?.count > 0) {
          toast.success(`Generated ${res.count} due expense${res.count === 1 ? "" : "s"}`);
          qc.invalidateQueries({ queryKey: ["recurring"] });
          qc.invalidateQueries({ queryKey: ["expenses-list"] });
        }
      }).catch(() => {})
    );
  }, [qc]);

  const listQ = useQuery({
    queryKey: ["recurring"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("*, expense_categories(name)")
        .order("next_due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const catQ = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("expense_categories").select("*").order("name")).data ?? [],
  });

  const stats = useMemo(() => {
    const list = (listQ.data ?? []).filter((r: any) => r.active);
    const monthly = list.reduce((s: number, r: any) => s + monthlyEquiv(Number(r.amount), r.frequency), 0);
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const upcoming = list
      .filter((r: any) => r.next_due_date && new Date(r.next_due_date) <= in30)
      .reduce((s: number, r: any) => s + Number(r.amount), 0);
    return { monthly, upcoming, count: list.length };
  }, [listQ.data]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        amount: Number(v.amount) || 0,
        category_id: v.category_id || null,
        frequency: v.frequency,
        start_date: v.start_date,
        end_date: v.end_date || null,
        next_due_date: v.next_due_date,
        active: !!v.active,
        notes: v.notes || null,
      };
      const { error } = v.id
        ? await supabase.from("recurring_expenses").update(payload).eq("id", v.id)
        : await supabase.from("recurring_expenses").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Saved"); setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recurring"] }); toast.success("Deleted"); },
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { generateDueRecurringExpenses } = await import("@/lib/recurring.functions");
      const res = await generateDueRecurringExpenses();
      return res.count;
    },
    onSuccess: (n) => {
      toast.success(`Generated ${n ?? 0} expense${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["recurring"] });
      qc.invalidateQueries({ queryKey: ["expenses-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Recurring Expenses"
        description="Subscriptions, rent, utilities — anything that repeats."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              <RefreshCw className="h-4 w-4" /> Run now
            </Button>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New recurring</Button></DialogTrigger>
              <RecurringDialog item={editing} categories={catQ.data ?? []} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
            </Dialog>
          </div>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Active subscriptions" value={String(stats.count)} icon={Repeat} />
        <StatCard label="Monthly equivalent" value={fmtMoney(stats.monthly)} />
        <StatCard label="Due next 30 days" value={fmtMoney(stats.upcoming)} />
      </section>

      <div className="card-surface overflow-hidden">
        {listQ.isLoading ? <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        : (listQ.data?.length ?? 0) === 0 ? (
          <EmptyState icon={Repeat} title="No recurring expenses" description="Add rent, subscriptions, internet, utilities…"
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New recurring</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Frequency</th>
                  <th className="py-3 px-4">Next due</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {listQ.data!.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(r); setOpen(true); }}>
                    <td className="py-3 px-4 font-medium">{r.name}</td>
                    <td className="py-3 px-4"><Badge variant="outline">{r.expense_categories?.name ?? "—"}</Badge></td>
                    <td className="py-3 px-4">{fmtMoney(r.amount)}</td>
                    <td className="py-3 px-4 capitalize text-muted-foreground">{r.frequency}</td>
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(r.next_due_date)}</td>
                    <td className="py-3 px-4">
                      <Badge variant={r.active ? "default" : "outline"}>{r.active ? "Active" : "Paused"}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete recurring expense?" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RecurringDialog({
  item, categories, onSubmit, loading,
}: { item: any; categories: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: item?.id,
    name: item?.name ?? "",
    amount: item?.amount ?? "",
    category_id: item?.category_id ?? "",
    recurring: true,
    frequency: item?.frequency ?? "monthly",
    start_date: item?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: item?.end_date ?? "",
    next_due_date: item?.next_due_date ?? new Date().toISOString().slice(0, 10),
    active: item?.active ?? true,
    notes: item?.notes ?? "",
  }));

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{item?.id ? "Edit recurring expense" : "New recurring expense"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Office rent, Netflix, …" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Category">
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <div className="text-sm font-medium">Recurring</div>
            <div className="text-xs text-muted-foreground">Auto-generate expense entries when due</div>
          </div>
          <Switch checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} />
        </div>

        {form.recurring && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Frequency">
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Next due date">
                <Input type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </Field>
              <Field label="End date (optional)">
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </Field>
            </div>
          </>
        )}

        <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div className="text-sm font-medium">Active</div>
          <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.name || !form.amount}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
