import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, TrendingUp } from "lucide-react";
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
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportCSV, exportPDF, exportXLSX } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/revenue")({
  head: () => ({ meta: [{ title: "Revenue — Ledgerly" }] }),
  component: RevenuePage,
});

function RevenuePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const revQ = useQuery({
    queryKey: ["revenue-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue")
        .select("*, employees(name), affiliates(name), leads(name, lead_sources(name))")
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const empQ = useQuery({ queryKey: ["employees"], queryFn: async () => (await supabase.from("employees").select("*").order("name")).data ?? [] });
  const affQ = useQuery({ queryKey: ["affiliates-min"], queryFn: async () => (await supabase.from("affiliates").select("id,name,active").eq("active", true).order("name")).data ?? [] });

  const stats = useMemo(() => {
    const list = revQ.data ?? [];
    const total = list.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const month = new Date().toISOString().slice(0, 7);
    const monthTotal = list.filter((r: any) => r.date?.startsWith(month)).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const byEmp = new Map<string, number>();
    const bySrc = new Map<string, number>();
    list.forEach((r: any) => {
      if (r.employee_id) byEmp.set(r.employees?.name ?? "?", (byEmp.get(r.employees?.name ?? "?") ?? 0) + Number(r.amount));
      const src = r.leads?.lead_sources?.name;
      if (src) bySrc.set(src, (bySrc.get(src) ?? 0) + Number(r.amount));
    });
    return { total, monthTotal, count: list.length, byEmp: [...byEmp.entries()].sort((a, b) => b[1] - a[1]), bySrc: [...bySrc.entries()].sort((a, b) => b[1] - a[1]) };
  }, [revQ.data]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        customer_name: v.customer_name,
        amount: Number(v.amount) || 0,
        date: v.date,
        lead_id: v.lead_id || null,
        employee_id: v.employee_id || null,
        notes: v.notes || null,
      };
      const { error } = v.id
        ? await supabase.from("revenue").update(payload).eq("id", v.id)
        : await supabase.from("revenue").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["revenue-list"] }); qc.invalidateQueries({ queryKey: ["revenue"] }); toast.success("Saved"); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("revenue").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["revenue-list"] }); toast.success("Deleted"); },
  });

  const handleExport = (type: "csv" | "xlsx" | "pdf") => {
    const rows = (revQ.data ?? []).map((r: any) => ({
      Date: r.date, Customer: r.customer_name, Amount: r.amount,
      Employee: r.employees?.name ?? "", Lead: r.leads?.name ?? "", Source: r.leads?.lead_sources?.name ?? "",
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
              <RevenueDialog rev={editing} employees={empQ.data ?? []} leads={leadsQ.data ?? []} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
            </Dialog>
          </div>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total revenue" value={fmtMoney(stats.total)} tone="positive" />
        <StatCard label="This month" value={fmtMoney(stats.monthTotal)} />
        <StatCard label="Transactions" value={String(stats.count)} />
        <StatCard label="Avg deal" value={fmtMoney(stats.count ? stats.total / stats.count : 0)} />
      </section>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <BreakdownCard title="Revenue by employee" rows={stats.byEmp} />
        <BreakdownCard title="Revenue by source" rows={stats.bySrc} />
      </div>

      <div className="card-surface overflow-hidden">
        {revQ.isLoading ? <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        : (revQ.data?.length ?? 0) === 0 ? (
          <EmptyState icon={TrendingUp} title="No revenue yet" description="Record your first sale to start tracking performance."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New revenue</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Affiliate</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {revQ.data!.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(r); setOpen(true); }}>
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(r.date)}</td>
                    <td className="py-3 px-4 font-medium">{r.customer_name}</td>
                    <td className="py-3 px-4 text-primary font-medium">{fmtMoney(r.amount)}</td>
                    <td className="py-3 px-4">{r.employees?.name || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{r.leads?.name || "—"}</td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete revenue?" />
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
  rev, employees, leads, onSubmit, loading,
}: { rev: any; employees: any[]; leads: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: rev?.id,
    customer_name: rev?.customer_name ?? "",
    amount: rev?.amount ?? "",
    date: rev?.date ?? new Date().toISOString().slice(0, 10),
    lead_id: rev?.lead_id ?? "",
    employee_id: rev?.employee_id ?? "",
    notes: rev?.notes ?? "",
  }));
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{rev?.id ? "Edit revenue" : "Record revenue"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Customer name"><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        </div>
        <Field label="Employee">
          <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Affiliate (optional)">
          <Select value={form.lead_id} onValueChange={(v) => setForm({ ...form, lead_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pick affiliate" /></SelectTrigger>
            <SelectContent>{leads.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}{l.lead_sources?.name ? ` · ${l.lead_sources.name}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <DialogFooter><Button onClick={() => onSubmit(form)} disabled={loading || !form.customer_name || !form.amount}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
