import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
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
import { fmtDate, fmtMoney, fmtPct, todayISO } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { PricingBadge } from "./sources";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";



export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Ledgerly" }] }),
  component: LeadsPage,
});

type Entry = {
  id: string;
  entry_date: string;
  source_id: string | null;
  campaign: string | null;
  received: number;
  activated: number;
  reported: number;
  notes: string | null;
  lead_sources?: { id: string; name: string; pricing_model: "CPL" | "CPA"; price: number; expected_conversion_rate?: number } | null;
};

function LeadsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const activeRange = useMemo(
    () => getRange(range, { start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );


  const q = useQuery({
    queryKey: ["daily-leads-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_entries")
        .select("*, lead_sources(id,name,pricing_model,price,expected_conversion_rate)")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const sourcesQ = useQuery({
    queryKey: ["sources-min"],
    queryFn: async () => (await supabase.from("lead_sources").select("id,name,pricing_model,price").eq("active", true).order("name")).data ?? [],
  });

  const allRows = q.data ?? [];
  const rows = useMemo(() => {
    const s = activeRange.start.getTime();
    const e = activeRange.end.getTime();
    return allRows.filter((r) => {
      const t = new Date(r.entry_date + "T00:00:00").getTime();
      return t >= s && t <= e;
    });
  }, [allRows, activeRange]);

  const stats = useMemo(() => {
    let received = 0, activated = 0, reported = 0, cplCost = 0, cpaCost = 0, cpaSavings = 0;
    for (const r of rows) {
      received += r.received;
      activated += r.activated;
      reported += r.reported;
      const s = r.lead_sources;
      if (!s) continue;
      const p = Number(s.price);
      if (s.pricing_model === "CPL") cplCost += p * r.received;
      else {
        cpaCost += p * r.reported;
        cpaSavings += p * Math.max(0, r.activated - r.reported);
      }
    }
    return {
      received, activated, reported,
      unreported: activated - reported,
      cplCost, cpaCost, cpaSavings,
      totalCost: cplCost + cpaCost,
      rate: received ? (activated / received) * 100 : 0,
    };
  }, [rows]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        entry_date: v.entry_date,
        source_id: v.source_id || null,
        campaign: v.campaign || null,
        received: Number(v.received) || 0,
        activated: Number(v.activated) || 0,
        converted: Number(v.activated) || 0,
        reported: Number(v.reported) || 0,
        cost: 0,
        notes: v.notes || null,
      };
      const { error } = v.id
        ? await supabase.from("daily_lead_entries").update(payload).eq("id", v.id)
        : await supabase.from("daily_lead_entries").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-leads-v2"] });
      qc.invalidateQueries({ queryKey: ["entries-for-sources"] });
      qc.invalidateQueries({ queryKey: ["dash-leads-v2"] });
      toast.success("Saved"); setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_lead_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-leads-v2"] }); toast.success("Deleted"); },
  });

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Log daily totals per source — received, activated, reported. Costs are computed from each source's pricing model."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add entry</Button>
            </DialogTrigger>
            <EntryDialog key={editing?.id ?? "new"} entry={editing} sources={sourcesQ.data ?? []}
              onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
          </Dialog>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Received" value={String(stats.received)} />
        <StatCard label="Activated" value={String(stats.activated)} tone="positive" />
        <StatCard label="Reported" value={String(stats.reported)} />
        <StatCard label="Unreported" value={String(stats.unreported)} />
        <StatCard label="Conv. rate" value={fmtPct(stats.rate)} />
        <StatCard label="Total cost" value={fmtMoney(stats.totalCost)} />
      </section>

      <div className="card-surface overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No entries yet"
            description="Add your first daily entry."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add entry</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Received</th>
                  <th className="py-3 px-4">Activated</th>
                  <th className="py-3 px-4">Reported</th>
                  <th className="py-3 px-4">Expected %</th>
                  <th className="py-3 px-4">Reported %</th>
                  <th className="py-3 px-4">Activated %</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Savings</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = r.lead_sources;
                  const p = s ? Number(s.price) : 0;
                  const cost = !s ? 0
                    : s.pricing_model === "CPL" ? p * r.received
                    : p * r.reported;
                  const savings = s?.pricing_model === "CPA" ? p * Math.max(0, r.activated - r.reported) : 0;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                        onClick={() => { setEditing(r); setOpen(true); }}>
                      <td className="py-3 px-4 font-medium">{fmtDate(r.entry_date)}</td>
                      <td className="py-3 px-4">{s?.name ?? "—"}</td>
                      <td className="py-3 px-4">{s ? <PricingBadge model={s.pricing_model} /> : "—"}</td>
                      <td className="py-3 px-4">{r.received}</td>
                      <td className="py-3 px-4">{r.activated}</td>
                      <td className="py-3 px-4">{r.reported}</td>
                      <td className="py-3 px-4">{s?.expected_conversion_rate ? fmtPct(Number(s.expected_conversion_rate)) : "—"}</td>
                      <td className="py-3 px-4">{r.received ? fmtPct((r.reported / r.received) * 100) : "—"}</td>
                      <td className="py-3 px-4">{r.received ? fmtPct((r.activated / r.received) * 100) : "—"}</td>
                      <td className="py-3 px-4">{fmtMoney(cost)}</td>
                      <td className="py-3 px-4 text-emerald-500">{s?.pricing_model === "CPA" ? fmtMoney(savings) : "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground truncate max-w-[14rem]">{r.notes || "—"}</td>
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
  entry, sources, onSubmit, loading,
}: { entry: Entry | null; sources: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: entry?.id,
    entry_date: entry?.entry_date ?? todayISO(),
    source_id: entry?.source_id ?? "",
    campaign: entry?.campaign ?? "",
    received: entry?.received ?? 0,
    activated: entry?.activated ?? 0,
    reported: entry?.reported ?? 0,
    notes: entry?.notes ?? "",
  }));
  const selected = sources.find((s) => s.id === form.source_id);
  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{entry?.id ? "Edit entry" : "New daily entry"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
          </Field>
          <Field label="Source">
            <Select value={form.source_id || "_none"} onValueChange={(v) => setForm({ ...form, source_id: v === "_none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} · {s.pricing_model} {fmtMoney(s.price)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {selected && (
          <div className="text-xs text-muted-foreground -mt-1">
            Billing: {selected.pricing_model} at {fmtMoney(selected.price)} ·
            {selected.pricing_model === "CPL"
              ? " Cost = Received × Price"
              : " Cost = Reported × Price · Savings on Activated − Reported"}
          </div>
        )}
        <Field label="Campaign (optional)">
          <Input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} placeholder="Summer promo" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Received">
            <Input type="number" min={0} value={form.received}
              onChange={(e) => setForm({ ...form, received: Number(e.target.value) })} />
          </Field>
          <Field label="Activated">
            <Input type="number" min={0} value={form.activated}
              onChange={(e) => setForm({ ...form, activated: Number(e.target.value) })} />
          </Field>
          <Field label="Reported">
            <Input type="number" min={0} value={form.reported}
              onChange={(e) => setForm({ ...form, reported: Number(e.target.value) })} />
          </Field>
        </div>
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
