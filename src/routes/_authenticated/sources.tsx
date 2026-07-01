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
  expected_conversion_rate: number;
};

export function PricingBadge({ model }: { model: "CPL" | "CPA" }) {
  return (
    <Badge variant={model === "CPL" ? "secondary" : "default"} className="uppercase tracking-wider">
      {model}
    </Badge>
  );
}

export function TargetBadge({ actual, expected }: { actual: number; expected: number }) {
  if (!expected) return <Badge variant="outline">No target</Badge>;
  const above = actual >= expected;
  return (
    <Badge
      className={above
        ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20"
        : "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20"}
      variant="outline"
    >
      {above ? "Above Target" : "Below Target"}
    </Badge>
  );
}

type PerfFilter = "all" | "above" | "below" | "no-target";
type SortKey = "name" | "expected" | "actual" | "variance" | "deficit";

function SourcesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [perfFilter, setPerfFilter] = useState<PerfFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("variance");

  const sourcesQ = useQuery({
    queryKey: ["lead-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_sources").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Source[];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["entries-for-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_entries")
        .select("source_id,received,activated,reported");
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
    const entries = entriesQ.data ?? [];
    const rev = revQ.data ?? [];

    return sources.map((s) => {
      const sEntries = entries.filter((e: any) => e.source_id === s.id);
      const total = sEntries.reduce((a: number, e: any) => a + (e.received ?? 0), 0);
      const activated = sEntries.reduce((a: number, e: any) => a + (e.activated ?? 0), 0);
      const reported = sEntries.reduce((a: number, e: any) => a + (e.reported ?? 0), 0);
      const price = Number(s.price);
      const expected = Number(s.expected_conversion_rate) || 0;
      const actualRate = total ? (activated / total) * 100 : 0;
      const variance = actualRate - expected;
      const expectedActivations = (total * expected) / 100;
      const deficit = activated - expectedActivations;
      const reportingRate = activated ? (reported / activated) * 100 : 0;

      let cost = 0;
      let savings = 0;
      if (s.pricing_model === "CPL") {
        cost = total * price;
      } else {
        cost = reported * price;
        savings = Math.max(0, activated - reported) * price;
      }

      const revenue = rev
        .filter((r: any) => r.leads?.source_id === s.id)
        .reduce((sum: number, r: any) => sum + Number(r.amount), 0);

      const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
      return {
        source: s, total, activated, reported, reportingRate,
        cost, savings, revenue, roi,
        expected, actualRate, variance, expectedActivations, deficit,
      };
    });
  }, [sourcesQ.data, entriesQ.data, revQ.data]);

  const visible = useMemo(() => {
    const filtered = analytics.filter((a) => {
      if (perfFilter === "all") return true;
      if (perfFilter === "no-target") return !a.expected;
      if (!a.expected) return false;
      return perfFilter === "above" ? a.actualRate >= a.expected : a.actualRate < a.expected;
    });
    const k = sortKey;
    return [...filtered].sort((a, b) => {
      if (k === "name") return a.source.name.localeCompare(b.source.name);
      if (k === "expected") return b.expected - a.expected;
      if (k === "actual") return b.actualRate - a.actualRate;
      if (k === "deficit") return b.deficit - a.deficit;
      return b.variance - a.variance;
    });
  }, [analytics, perfFilter, sortKey]);

  const totals = useMemo(() => analytics.reduce(
    (a, x) => ({
      leads: a.leads + x.total,
      activated: a.activated + x.activated,
      reported: a.reported + x.reported,
      cost: a.cost + x.cost,
      savings: a.savings + x.savings,
      revenue: a.revenue + x.revenue,
      expectedActivations: a.expectedActivations + x.expectedActivations,
    }),
    { leads: 0, activated: 0, reported: 0, cost: 0, savings: 0, revenue: 0, expectedActivations: 0 },
  ), [analytics]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        pricing_model: v.pricing_model,
        price: Number(v.price) || 0,
        expected_conversion_rate: Number(v.expected_conversion_rate) || 0,
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

  const surplus = totals.activated - totals.expectedActivations;

  return (
    <div>
      <PageHeader
        title="Lead Sources"
        description="Manage acquisition channels with CPL or CPA pricing and see per-source ROI."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Add source</Button>
            </DialogTrigger>
            <SourceDialog key={editing?.id ?? "new"} source={editing} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
          </Dialog>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatCard label="Expected activations" value={String(Math.round(totals.expectedActivations))} />
        <StatCard label="Actual activations" value={String(totals.activated)} tone="positive" />
        <StatCard
          label={surplus >= 0 ? "Activation surplus" : "Activation deficit"}
          value={`${surplus >= 0 ? "+" : ""}${Math.round(surplus)}`}
          tone={surplus >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Revenue" value={fmtMoney(totals.revenue)} />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Leads" value={String(totals.leads)} />
        <StatCard label="Reported" value={String(totals.reported)} />
        <StatCard label="Total cost" value={fmtMoney(totals.cost)} />
        <StatCard label="CPA savings" value={fmtMoney(totals.savings)} tone="positive" />
        <StatCard label="Avg. conv. rate" value={fmtPct(totals.leads ? (totals.activated / totals.leads) * 100 : 0)} />
      </section>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[180px]">
          <Label className="text-xs">Performance</Label>
          <Select value={perfFilter} onValueChange={(v) => setPerfFilter(v as PerfFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="above">Above target</SelectItem>
              <SelectItem value="below">Below target</SelectItem>
              <SelectItem value="no-target">No target set</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs">Sort by</Label>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="variance">Variance (best first)</SelectItem>
              <SelectItem value="actual">Actual conversion rate</SelectItem>
              <SelectItem value="expected">Expected conversion rate</SelectItem>
              <SelectItem value="deficit">Activation surplus</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        {sourcesQ.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Tag}
            title={analytics.length === 0 ? "No sources yet" : "No sources match filter"}
            description={analytics.length === 0 ? "Create your first lead source." : "Try a different performance filter."}
            action={analytics.length === 0 ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add source</Button> : undefined}
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
                  <th className="py-3 px-4">Expected</th>
                  <th className="py-3 px-4">Actual</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4"></th>

                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.source.id}
                      className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(a.source); setOpen(true); }}>
                    <td className="py-3 px-4 font-medium">{a.source.name}{!a.source.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}</td>
                    <td className="py-3 px-4"><PricingBadge model={a.source.pricing_model} /></td>
                    <td className="py-3 px-4">{fmtMoney(a.source.price)}</td>
                    <td className="py-3 px-4">{a.total}</td>
                    <td className="py-3 px-4">{a.expected ? fmtPct(a.expected) : "—"}</td>
                    <td className="py-3 px-4">{fmtPct(a.actualRate)}</td>
                    <td className="py-3 px-4"><TargetBadge actual={a.actualRate} expected={a.expected} /></td>
                    <td className="py-3 px-4">{fmtMoney(a.cost)}</td>

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
    expected_conversion_rate: source?.expected_conversion_rate ?? 0,
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
        <Field label="Expected conversion rate (%)">
          <Input type="number" min={0} max={100} step="0.1" value={form.expected_conversion_rate}
            onChange={(e) => setForm({ ...form, expected_conversion_rate: Number(e.target.value) })}
            placeholder="e.g. 25" />
        </Field>
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
