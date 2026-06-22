import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCSV, exportPDF, exportXLSX } from "@/lib/export";
import { StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Ledgerly" }] }),
  component: LeadsPage,
});

type Entry = {
  id: string;
  entry_date: string;
  received: number;
  converted: number;
  cost: number;
  notes: string | null;
};

function LeadsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);

  const q = useQuery({
    queryKey: ["daily-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_entries")
        .select("*")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const rows = q.data ?? [];

  const stats = useMemo(() => {
    const received = rows.reduce((s, r) => s + Number(r.received), 0);
    const converted = rows.reduce((s, r) => s + Number(r.converted), 0);
    const cost = rows.reduce((s, r) => s + Number(r.cost), 0);
    return {
      received,
      converted,
      cost,
      rate: received ? (converted / received) * 100 : 0,
      cpl: received ? cost / received : 0,
      cpa: converted ? cost / converted : 0,
    };
  }, [rows]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        entry_date: v.entry_date,
        received: Number(v.received) || 0,
        converted: Number(v.converted) || 0,
        cost: Number(v.cost) || 0,
        notes: v.notes || null,
      };
      if (v.id) {
        const { error } = await supabase.from("daily_lead_entries").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_lead_entries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-leads"] });
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_lead_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-leads"] });
      toast.success("Deleted");
    },
  });

  const handleExport = (type: "csv" | "xlsx" | "pdf") => {
    const out = rows.map((r) => ({
      Date: fmtDate(r.entry_date),
      Received: r.received,
      Converted: r.converted,
      Cost: r.cost,
      "Conv. rate": `${((r.converted / Math.max(r.received, 1)) * 100).toFixed(1)}%`,
      Notes: r.notes ?? "",
    }));
    if (!out.length) return toast.error("Nothing to export");
    if (type === "csv") exportCSV(out, "daily-leads");
    else if (type === "xlsx") exportXLSX(out, "daily-leads", "Leads");
    else exportPDF("Daily leads", out, "daily-leads");
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Log how many leads you received each day, how many converted, and what they cost."
        actions={
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4" /> Add entry</Button>
              </DialogTrigger>
              <EntryDialog
                entry={editing}
                onSubmit={(v) => upsert.mutate(v)}
                loading={upsert.isPending}
              />
            </Dialog>
          </div>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Leads received" value={String(stats.received)} />
        <StatCard label="Converted" value={String(stats.converted)} tone="positive" />
        <StatCard label="Conversion rate" value={fmtPct(stats.rate)} />
        <StatCard label="Total cost" value={fmtMoney(stats.cost)} />
        <StatCard label="Cost / lead" value={fmtMoney(stats.cpl)} />
        <StatCard label="Cost / conversion" value={fmtMoney(stats.cpa)} />
      </section>

      <div className="card-surface overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No entries yet"
            description="Add your first daily lead entry to start tracking conversions and cost."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add entry</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Received</th>
                  <th className="py-3 px-4">Converted</th>
                  <th className="py-3 px-4">Conv. rate</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Cost / lead</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rate = r.received ? (r.converted / r.received) * 100 : 0;
                  const cpl = r.received ? Number(r.cost) / r.received : 0;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                        onClick={() => { setEditing(r); setOpen(true); }}>
                      <td className="py-3 px-4 font-medium">{fmtDate(r.entry_date)}</td>
                      <td className="py-3 px-4">{r.received}</td>
                      <td className="py-3 px-4">{r.converted}</td>
                      <td className="py-3 px-4">{fmtPct(rate)}</td>
                      <td className="py-3 px-4">{fmtMoney(r.cost)}</td>
                      <td className="py-3 px-4">{fmtMoney(cpl)}</td>
                      <td className="py-3 px-4 text-muted-foreground truncate max-w-[18rem]">{r.notes || "—"}</td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete entry?" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EntryDialog({
  entry, onSubmit, loading,
}: { entry: Entry | null; onSubmit: (v: any) => void; loading: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => ({
    id: entry?.id,
    entry_date: entry?.entry_date ?? today,
    received: entry?.received ?? 0,
    converted: entry?.converted ?? 0,
    cost: entry?.cost ?? 0,
    notes: entry?.notes ?? "",
  }));
  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{entry?.id ? "Edit entry" : "New daily entry"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Date">
          <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Leads received">
            <Input type="number" min={0} value={form.received}
              onChange={(e) => setForm({ ...form, received: Number(e.target.value) })} />
          </Field>
          <Field label="Converted">
            <Input type="number" min={0} value={form.converted}
              onChange={(e) => setForm({ ...form, converted: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Total cost">
          <Input type="number" min={0} step="0.01" value={form.cost}
            onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
        </Field>
        <Field label="Notes (optional)">
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
