import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
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
import { StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Ledgerly" }] }),
  component: LeadsPage,
});

type Entry = {
  id: string;
  entry_date: string;
  source: string | null;
  campaign: string | null;
  received: number;
  converted: number;
  reported: number;
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
    const reported = rows.reduce((s, r) => s + Number(r.reported), 0);
    const cost = rows.reduce((s, r) => s + Number(r.cost), 0);
    return {
      received, converted, reported, cost,
      rate: received ? (converted / received) * 100 : 0,
      cpl: received ? cost / received : 0,
    };
  }, [rows]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        entry_date: v.entry_date,
        source: v.source || null,
        campaign: v.campaign || null,
        received: Number(v.received) || 0,
        converted: Number(v.converted) || 0,
        reported: Number(v.reported) || 0,
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

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Daily log: source, campaign, how many received, converted, reported, and cost."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add entry</Button>
            </DialogTrigger>
            <EntryDialog entry={editing} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
          </Dialog>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Received" value={String(stats.received)} />
        <StatCard label="Converted" value={String(stats.converted)} tone="positive" />
        <StatCard label="Reported" value={String(stats.reported)} />
        <StatCard label="Conv. rate" value={fmtPct(stats.rate)} />
        <StatCard label="Total cost" value={fmtMoney(stats.cost)} />
        <StatCard label="Cost / lead" value={fmtMoney(stats.cpl)} />
      </section>

      <div className="card-surface overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No entries yet"
            description="Add your first daily lead entry."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add entry</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Campaign</th>
                  <th className="py-3 px-4">Received</th>
                  <th className="py-3 px-4">Converted</th>
                  <th className="py-3 px-4">Reported</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(r); setOpen(true); }}>
                    <td className="py-3 px-4 font-medium">{fmtDate(r.entry_date)}</td>
                    <td className="py-3 px-4">{r.source || "—"}</td>
                    <td className="py-3 px-4">{r.campaign || "—"}</td>
                    <td className="py-3 px-4">{r.received}</td>
                    <td className="py-3 px-4">{r.converted}</td>
                    <td className="py-3 px-4">{r.reported}</td>
                    <td className="py-3 px-4">{fmtMoney(r.cost)}</td>
                    <td className="py-3 px-4 text-muted-foreground truncate max-w-[14rem]">{r.notes || "—"}</td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete entry?" />
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

function EntryDialog({
  entry, onSubmit, loading,
}: { entry: Entry | null; onSubmit: (v: any) => void; loading: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => ({
    id: entry?.id,
    entry_date: entry?.entry_date ?? today,
    source: entry?.source ?? "",
    campaign: entry?.campaign ?? "",
    received: entry?.received ?? 0,
    converted: entry?.converted ?? 0,
    reported: entry?.reported ?? 0,
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
          <Field label="Source">
            <Input placeholder="Facebook, Google…" value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </Field>
          <Field label="Campaign">
            <Input placeholder="Summer promo" value={form.campaign}
              onChange={(e) => setForm({ ...form, campaign: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Received">
            <Input type="number" min={0} value={form.received}
              onChange={(e) => setForm({ ...form, received: Number(e.target.value) })} />
          </Field>
          <Field label="Converted">
            <Input type="number" min={0} value={form.converted}
              onChange={(e) => setForm({ ...form, converted: Number(e.target.value) })} />
          </Field>
          <Field label="Reported">
            <Input type="number" min={0} value={form.reported}
              onChange={(e) => setForm({ ...form, reported: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Total cost">
          <Input type="number" min={0} step="0.01" value={form.cost}
            onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
        </Field>
        <Field label="Notes (optional)">
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
