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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { PricingBadge } from "./sources";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Ledgerly" }] }),
  component: LeadsPage,
});

type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source_id: string | null;
  employee_id: string | null;
  activated: boolean;
  reported: boolean;
  status: string;
  notes: string | null;
  created_at: string;
  lead_sources?: { id: string; name: string; pricing_model: "CPL" | "CPA"; price: number } | null;
  employees?: { name: string } | null;
};

function LeadsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const q = useQuery({
    queryKey: ["leads-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, lead_sources(id,name,pricing_model,price), employees(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const sourcesQ = useQuery({
    queryKey: ["sources-min"],
    queryFn: async () => (await supabase.from("lead_sources").select("id,name,pricing_model,price").eq("active", true).order("name")).data ?? [],
  });
  const empQ = useQuery({
    queryKey: ["employees-min"],
    queryFn: async () => (await supabase.from("employees").select("id,name").eq("active", true).order("name")).data ?? [],
  });

  const rows = q.data ?? [];

  const stats = useMemo(() => {
    let leads = rows.length;
    let activated = 0, reported = 0, cplCost = 0, cpaCost = 0, cpaSavings = 0;
    for (const l of rows) {
      const s = l.lead_sources;
      if (l.activated) activated++;
      if (l.activated && l.reported) reported++;
      if (!s) continue;
      const p = Number(s.price);
      if (s.pricing_model === "CPL") cplCost += p;
      else {
        if (l.activated && l.reported) cpaCost += p;
        if (l.activated && !l.reported) cpaSavings += p;
      }
    }
    return {
      leads, activated, reported,
      unreported: activated - reported,
      cplCost, cpaCost, cpaSavings,
      totalCost: cplCost + cpaCost,
      convRate: leads ? (activated / leads) * 100 : 0,
    };
  }, [rows]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        email: v.email || null,
        phone: v.phone || null,
        source_id: v.source_id || null,
        employee_id: v.employee_id || null,
        activated: !!v.activated,
        reported: !!v.reported,
        status: (v.activated ? "activated" : "new") as "activated" | "new",
        notes: v.notes || null,
      };
      const { error } = v.id
        ? await supabase.from("leads").update(payload).eq("id", v.id)
        : await supabase.from("leads").insert(payload);
      if (error) throw error;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["leads-for-sources"] });
      qc.invalidateQueries({ queryKey: ["dash-leads-v2"] });
      toast.success("Saved"); setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads-list"] }); toast.success("Deleted"); },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { activated?: boolean; reported?: boolean } }) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },


    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["leads-for-sources"] });
      qc.invalidateQueries({ queryKey: ["dash-leads-v2"] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track each lead with its source, activation status, and reporting flag."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add lead</Button>
            </DialogTrigger>
            <LeadDialog lead={editing} sources={sourcesQ.data ?? []} employees={empQ.data ?? []}
              onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
          </Dialog>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Received" value={String(stats.leads)} />
        <StatCard label="Activated" value={String(stats.activated)} tone="positive" />
        <StatCard label="Reported" value={String(stats.reported)} />
        <StatCard label="Unreported" value={String(stats.unreported)} />
        <StatCard label="Conv. rate" value={fmtPct(stats.convRate)} />
        <StatCard label="Total cost" value={fmtMoney(stats.totalCost)} />
      </section>

      <div className="card-surface overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads yet"
            description="Add your first lead."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add lead</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Closer</th>
                  <th className="py-3 px-4">Activated</th>
                  <th className="py-3 px-4">Reported</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(r); setOpen(true); }}>
                    <td className="py-3 px-4">{fmtDate(r.created_at)}</td>
                    <td className="py-3 px-4 font-medium">{r.name}</td>
                    <td className="py-3 px-4">{r.lead_sources?.name ?? "—"}</td>
                    <td className="py-3 px-4">{r.lead_sources ? <PricingBadge model={r.lead_sources.pricing_model} /> : "—"}</td>
                    <td className="py-3 px-4">{r.lead_sources ? fmtMoney(r.lead_sources.price) : "—"}</td>
                    <td className="py-3 px-4">{r.employees?.name ?? "—"}</td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <Switch checked={r.activated}
                        onCheckedChange={(v) => toggle.mutate({ id: r.id, patch: { activated: v, ...(v ? {} : { reported: false }) } as any })} />
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <Switch checked={r.reported} disabled={!r.activated}
                        onCheckedChange={(v) => toggle.mutate({ id: r.id, patch: { reported: v } as any })} />
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(r.id)} label="Delete lead?" />
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

function LeadDialog({
  lead, sources, employees, onSubmit, loading,
}: { lead: Lead | null; sources: any[]; employees: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: lead?.id,
    name: lead?.name ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    source_id: lead?.source_id ?? "",
    employee_id: lead?.employee_id ?? "",
    activated: lead?.activated ?? false,
    reported: lead?.reported ?? false,
    notes: lead?.notes ?? "",
  }));
  const selectedSource = sources.find((s) => s.id === form.source_id);
  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{lead?.id ? "Edit lead" : "New lead"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
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
          {selectedSource && (
            <div className="text-xs text-muted-foreground mt-1">
              Billing: {selectedSource.pricing_model} at {fmtMoney(selectedSource.price)}
            </div>
          )}
        </Field>
        <Field label="Closer (optional)">
          <Select value={form.employee_id || "_none"} onValueChange={(v) => setForm({ ...form, employee_id: v === "_none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.activated}
              onCheckedChange={(v) => setForm({ ...form, activated: v, reported: v ? form.reported : false })} />
            Activated
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.reported} disabled={!form.activated}
              onCheckedChange={(v) => setForm({ ...form, reported: v })} />
            Reported
          </label>
        </div>
        <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.name}>{loading ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
