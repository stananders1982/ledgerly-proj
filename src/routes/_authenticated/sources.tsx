import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtMoney, fmtPct } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/sources")({
  head: () => ({ meta: [{ title: "Lead Sources — Ledgerly" }] }),
  component: SourcesPage,
});

type Source = {
  id: string;
  name: string;
  active: boolean;
  pricing_model: "CPL" | "CPA";
  price: number;
};

export function PricingBadge({ model }: { model: "CPL" | "CPA" }) {
  return (
    <Badge variant={model === "CPL" ? "secondary" : "default"} className="uppercase tracking-wider">
      {model}
    </Badge>
  );
}

function SourcesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);

  const sourcesQ = useQuery({
    queryKey: ["lead-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_sources").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Source[];
    },
  });

  const leadsQ = useQuery({
    queryKey: ["leads-for-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads").select("id,source_id,activated,reported");
      if (error) throw error;
      return data ?? [];
    },
  });

  const revQ = useQuery({
    queryKey: ["revenue-for-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue").select("amount,lead_id,leads(source_id)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const analytics = useMemo(() => {
    const sources = sourcesQ.data ?? [];
    const leads = leadsQ.data ?? [];
    const rev = revQ.data ?? [];

    return sources.map((s) => {
      const sLeads = leads.filter((l: any) => l.source_id === s.id);
      const total = sLeads.length;
      const activated = sLeads.filter((l: any) => l.activated).length;
      const reported = sLeads.filter((l: any) => l.activated && l.reported).length;
      const price = Number(s.price);
      const reportingRate = activated ? (reported / activated) * 100 : 0;

      let cost = 0;
      let savings = 0;
      if (s.pricing_model === "CPL") {
        cost = total * price;
      } else {
        cost = reported * price;
        savings = (activated - reported) * price;
      }

      const revenue = rev
        .filter((r: any) => r.leads?.source_id === s.id)
        .reduce((sum: number, r: any) => sum + Number(r.amount), 0);

      const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
      return { source: s, total, activated, reported, reportingRate, cost, savings, revenue, roi };
    });
  }, [sourcesQ.data, leadsQ.data, revQ.data]);

  const totals = useMemo(() => analytics.reduce(
    (a, x) => ({
      leads: a.leads + x.total,
      activated: a.activated + x.activated,
      reported: a.reported + x.reported,
      cost: a.cost + x.cost,
      savings: a.savings + x.savings,
      revenue: a.revenue + x.revenue,
    }),
    { leads: 0, activated: 0, reported: 0, cost: 0, savings: 0, revenue: 0 },
  ), [analytics]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        pricing_model: v.pricing_model,
        price: Number(v.price) || 0,
        active: v.active,
      };
      const { error } = v.id
        ? await supabase.from("lead_sources").update(payload).eq("id", v.id)
        : await supabase.from("lead_sources").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-sources"] });
      toast.success("Saved");
      setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lead-sources"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Lead Sources"
        description="Manage acquisition channels with CPL or CPA pricing and see per-source ROI."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add source</Button>
            </DialogTrigger>
            <SourceDialog source={editing} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
          </Dialog>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Leads" value={String(totals.leads)} />
        <StatCard label="Activated" value={String(totals.activated)} tone="positive" />
        <StatCard label="Reported" value={String(totals.reported)} />
        <StatCard label="Total cost" value={fmtMoney(totals.cost)} />
        <StatCard label="CPA savings" value={fmtMoney(totals.savings)} tone="positive" />
        <StatCard label="Revenue" value={fmtMoney(totals.revenue)} />
      </section>

      <div className="card-surface overflow-hidden">
        {sourcesQ.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : analytics.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No sources yet"
            description="Create your first lead source."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add source</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Leads</th>
                  <th className="py-3 px-4">Activated</th>
                  <th className="py-3 px-4">Reporting</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Savings</th>
                  <th className="py-3 px-4">Revenue</th>
                  <th className="py-3 px-4">ROI</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((a) => (
                  <tr key={a.source.id}
                      className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(a.source); setOpen(true); }}>
                    <td className="py-3 px-4 font-medium">{a.source.name}{!a.source.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}</td>
                    <td className="py-3 px-4"><PricingBadge model={a.source.pricing_model} /></td>
                    <td className="py-3 px-4">{fmtMoney(a.source.price)}</td>
                    <td className="py-3 px-4">{a.total}</td>
                    <td className="py-3 px-4">{a.activated} {a.source.pricing_model === "CPA" && <span className="text-muted-foreground text-xs">/ {a.reported} reported</span>}</td>
                    <td className="py-3 px-4">{a.source.pricing_model === "CPA" ? fmtPct(a.reportingRate) : "—"}</td>
                    <td className="py-3 px-4">{fmtMoney(a.cost)}</td>
                    <td className="py-3 px-4 text-emerald-500">{a.source.pricing_model === "CPA" ? fmtMoney(a.savings) : "—"}</td>
                    <td className="py-3 px-4">{fmtMoney(a.revenue)}</td>
                    <td className={`py-3 px-4 ${a.roi >= 0 ? "text-emerald-500" : "text-destructive"}`}>{a.cost > 0 ? fmtPct(a.roi) : "—"}</td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(a.source.id)} label="Delete source?" />
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

function SourceDialog({
  source, onSubmit, loading,
}: { source: Source | null; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: source?.id,
    name: source?.name ?? "",
    pricing_model: (source?.pricing_model ?? "CPL") as "CPL" | "CPA",
    price: source?.price ?? 0,
    active: source?.active ?? true,
  }));
  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{source?.id ? "Edit source" : "New lead source"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Facebook Ads" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pricing model">
            <Select value={form.pricing_model} onValueChange={(v: "CPL" | "CPA") => setForm({ ...form, pricing_model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CPL">CPL — Cost per Lead</SelectItem>
                <SelectItem value="CPA">CPA — Cost per Activation</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Price">
            <Input type="number" min={0} step="0.01" value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
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
