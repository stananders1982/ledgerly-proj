import { createFileRoute } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Receipt } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtDate, fmtMoney } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportCSV, exportPDF, exportXLSX } from "@/lib/export";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Ledgerly" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const activeRange = useMemo(
    () => getRange(range, { start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );

  const expQ = useQuery({
    queryKey: ["expenses-list"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("expenses")
        .select("*, expense_categories(name), affiliates(id,name)")
        .order("date", { ascending: false }));
      return data ?? [];
    },
  });
  const catQ = useQuery({
    queryKey: ["categories"],
    queryFn: async () => await fetchAll(() => supabase.from("expense_categories").select("*").order("name")),
  });
  const affQ = useQuery({
    queryKey: ["affiliates-min"],
    queryFn: async () => await fetchAll(() => supabase.from("affiliates").select("id,name").order("name")),
  });

  const filtered = useMemo(() => {
    const list = expQ.data ?? [];
    const s = activeRange.start.getTime();
    const e = activeRange.end.getTime();
    return list.filter((x: any) => {
      const t = new Date(x.date + "T00:00:00").getTime();
      return t >= s && t <= e;
    });
  }, [expQ.data, activeRange]);

  const { sorted, sort, toggle } = useSort<any>(filtered, {
    date: (e) => e.date,
    category: (e) => e.expense_categories?.name ?? "",
    affiliate: (e) => e.affiliates?.name ?? "",
    amount: (e) => Number(e.amount ?? 0),
    notes: (e) => e.notes ?? "",
  });
  const { pageItems, ...pg } = usePagination(sorted, 30);

  const stats = useMemo(() => {
    const total = filtered.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const byCat = new Map<string, number>();
    filtered.forEach((e: any) => {
      const k = e.expense_categories?.name ?? "Uncategorized";
      byCat.set(k, (byCat.get(k) ?? 0) + Number(e.amount));
    });
    const allTotal = (expQ.data ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
    return { total, allTotal, count: filtered.length, byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]) };
  }, [filtered, expQ.data]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        amount: Number(v.amount) || 0,
        category_id: v.category_id || null,
        affiliate_id: v.affiliate_id || null,
        date: v.date,
        notes: v.notes || null,
      };
      const { error } = v.id
        ? await supabase.from("expenses").update(payload).eq("id", v.id)
        : await supabase.from("expenses").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses-list"] }); qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("Saved"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("expenses").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses-list"] }); toast.success("Deleted"); },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectedTotal = filtered
    .filter((e: any) => selected.has(e.id))
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      if (!ids.length) return 0;
      const { error } = await supabase.from("expenses").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["expenses-list"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setSelected(new Set());
      if (count) toast.success(`Deleted ${count} expense${count === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkCategory = useMutation({
    mutationFn: async (categoryId: string) => {
      const ids = [...selected];
      if (!ids.length) return 0;
      const { error } = await supabase.from("expenses").update({ category_id: categoryId }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["expenses-list"] });
      setSelected(new Set());
      if (count) toast.success(`Recategorized ${count} expense${count === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleExport = (type: "csv" | "xlsx" | "pdf") => {
    const rows = filtered.map((e: any) => ({ Date: e.date, Category: e.expense_categories?.name ?? "", Affiliate: e.affiliates?.name ?? "", Amount: e.amount, Notes: e.notes ?? "" }));
    if (!rows.length) return toast.error("Nothing to export");
    if (type === "csv") exportCSV(rows, "expenses");
    else if (type === "xlsx") exportXLSX(rows, "expenses", "Expenses");
    else exportPDF("Expenses", rows, "expenses");
  };

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track every outflow and watch your category mix."
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
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New expense</Button></DialogTrigger>
              <ExpenseDialog key={editing?.id ?? "new"} exp={editing} categories={catQ.data ?? []} affiliates={affQ.data ?? []} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
            </Dialog>
          </div>
        }
      />

      <div className="mb-4">
        <DateRangePicker
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
        />
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label={activeRange.label} value={fmtMoney(stats.total)} />
        <StatCard label="All-time spend" value={fmtMoney(stats.allTotal)} />
        <StatCard label="Entries" value={String(stats.count)} />
        <StatCard label="Avg expense" value={fmtMoney(stats.count ? stats.total / stats.count : 0)} />
      </section>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {stats.byCat.map(([cat, total]) => (
          <div key={cat} className="card-surface p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</div>
            <div className="font-display text-lg font-semibold mt-1">{fmtMoney(total)}</div>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-muted-foreground">{fmtMoney(selectedTotal)}</span>
          <div className="flex-1" />
          <Select onValueChange={(v) => bulkCategory.mutate(v)}>
            <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Set category" /></SelectTrigger>
            <SelectContent>
              {(catQ.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportCSV(
                filtered
                  .filter((e: any) => selected.has(e.id))
                  .map((e: any) => ({ Date: e.date, Category: e.expense_categories?.name ?? "", Amount: e.amount, Notes: e.notes ?? "" })),
                "expenses-selection",
              )
            }
          >
            Export selection
          </Button>
          <ConfirmDelete onConfirm={() => bulkDelete.mutate()} label={`Delete ${selected.size} selected expense(s)?`} />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="card-surface overflow-hidden">
        {expQ.isLoading ? <TableSkeleton cols={6} />
        : (expQ.data?.length ?? 0) === 0 ? (
          <EmptyState icon={Receipt} title="No expenses yet" description="Start logging to see category breakdowns."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New expense</Button>} />
        ) : (
          <>
          <DataCardList>
            {pageItems.map((e: any) => (
              <DataCard
                key={e.id}
                title={e.expense_categories?.name ?? "Expense"}
                subtitle={fmtDate(e.date)}
                onClick={() => { setEditing(e); setOpen(true); }}
                actions={<ConfirmDelete onConfirm={() => del.mutate(e.id)} label="Delete expense?" />}
                fields={[
                  { label: "Amount", value: <span className="num font-medium">{fmtMoney(e.amount)}</span> },
                  { label: "Affiliate", value: e.affiliates?.name ?? "—" },
                  { label: "Notes", value: e.notes || "—" },
                ]}
              />
            ))}
          </DataCardList>
          <div className="hidden md:block overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4 w-10">
                    <Checkbox
                      checked={pageItems.length > 0 && pageItems.every((e: any) => selected.has(e.id))}
                      onCheckedChange={(c) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          pageItems.forEach((e: any) => (c ? next.add(e.id) : next.delete(e.id)));
                          return next;
                        })
                      }
                      aria-label="Select all on page"
                    />
                  </th>
                  <SortTh label="Date" k="date" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Category" k="category" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Affiliate" k="affiliate" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Amount" k="amount" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Notes" k="notes" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((e: any) => (
                  <tr key={e.id} className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(e); setOpen(true); }}>
                    <td className="py-3 px-4" onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleSelected(e.id)} aria-label="Select expense" />
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(e.date)}</td>
                    <td className="py-3 px-4"><Badge variant="outline">{e.expense_categories?.name ?? "—"}</Badge></td>
                    <td className="py-3 px-4 text-muted-foreground">{e.affiliates?.name ?? "—"}</td>
                    <td className="py-3 px-4 font-medium">{fmtMoney(e.amount)}</td>
                    <td className="py-3 px-4 text-muted-foreground">{e.notes || "—"}</td>
                    <td className="py-3 px-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(e.id)} label="Delete expense?" />
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

function ExpenseDialog({
  exp, categories, affiliates, onSubmit, loading,
}: { exp: any; categories: any[]; affiliates: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: exp?.id,
    amount: exp?.amount ?? "",
    category_id: exp?.category_id ?? "",
    affiliate_id: exp?.affiliate_id ?? "",
    date: exp?.date ?? new Date().toISOString().slice(0, 10),
    notes: exp?.notes ?? "",
  }));
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{exp?.id ? "Edit expense" : "New expense"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        </div>
        <Field label="Category">
          <Select value={form.category_id} onValueChange={(v) => {
            const cat = categories.find((c) => c.id === v);
            const isAff = cat?.name?.toLowerCase() === "affiliate";
            setForm({ ...form, category_id: v, affiliate_id: isAff ? form.affiliate_id : "" });
          }}>
            <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {categories.find((c) => c.id === form.category_id)?.name?.toLowerCase() === "affiliate" && (
          <Field label="Affiliate">
            <Select value={form.affiliate_id || "__none__"} onValueChange={(v) => setForm({ ...form, affiliate_id: v === "__none__" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Pick affiliate" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {affiliates.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <DialogFooter><Button onClick={() => onSubmit(form)} disabled={loading || !form.amount}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
