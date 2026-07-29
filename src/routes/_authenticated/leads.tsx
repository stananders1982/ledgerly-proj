import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, X } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtDate, fmtMoney, fmtPct, todayISO } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { PricingBadge } from "./sources";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { useSort, SortTh } from "@/components/sortable-table";



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

type Activation = { id: string; entry_id: string; employee_id: string; conversion_employee_id?: string | null; activated_count: number; lead_name?: string | null; potential?: string | null };
type Split = { id?: string; employee_id: string; conversion_employee_id?: string | null; activated_count: number; lead_name?: string | null; potential?: string | null };

function LeadsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
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

  const employeesQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean; team?: string | null }[];
    },
  });

  const activationsQ = useQuery({
    queryKey: ["daily-lead-activations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_lead_activations").select("*");
      if (error) throw error;
      return (data ?? []) as Activation[];
    },
  });

  const allRows = q.data ?? [];
  const rows = useMemo(() => {
    const s = activeRange.start.getTime();
    const e = activeRange.end.getTime();
    return allRows.filter((r) => {
      const t = new Date(r.entry_date + "T00:00:00").getTime();
      if (t < s || t > e) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(r.source_id ?? "")) return false;
      return true;
    });
  }, [allRows, activeRange, sourceFilter]);

  const { sorted, sort, toggle } = useSort<any>(rows, {
    date: (r) => r.entry_date,
    source: (r) => r.lead_sources?.name ?? "",
    model: (r) => r.lead_sources?.pricing_model ?? "",
    received: (r) => Number(r.received ?? 0),
    activated: (r) => Number(r.activated ?? 0),
    reported: (r) => Number(r.reported ?? 0),
    expected: (r) => Number(r.lead_sources?.expected_conversion_rate ?? 0),
    reportedPct: (r) => (r.received ? Number(r.reported) / Number(r.received) : 0),
    activatedPct: (r) => (r.received ? Number(r.activated) / Number(r.received) : 0),
    cost: (r) => {
      const s2 = r.lead_sources;
      if (!s2) return 0;
      const p2 = Number(s2.price);
      return s2.pricing_model === "CPL" ? p2 * r.received : p2 * r.reported;
    },
    savings: (r) =>
      r.lead_sources?.pricing_model === "CPA"
        ? Number(r.lead_sources.price) * Math.max(0, r.activated - r.reported)
        : 0,
    notes: (r) => r.notes ?? "",
  });

  const activationsByEntry = useMemo(() => {
    const m = new Map<string, Activation[]>();
    for (const a of activationsQ.data ?? []) {
      const arr = m.get(a.entry_id) ?? [];
      arr.push(a);
      m.set(a.entry_id, arr);
    }
    return m;
  }, [activationsQ.data]);

  const employeeName = (id: string) =>
    (employeesQ.data ?? []).find((e) => e.id === id)?.name ?? "—";

  const byEmployee = useMemo(() => {
    const visibleIds = new Set(rows.map((r) => r.id));
    const totals = new Map<string, number>();
    for (const a of activationsQ.data ?? []) {
      if (!visibleIds.has(a.entry_id)) continue;
      totals.set(a.employee_id, (totals.get(a.employee_id) ?? 0) + a.activated_count);
    }
    return Array.from(totals.entries())
      .map(([id, count]) => ({ id, name: employeeName(id), count }))
      .sort((a, b) => b.count - a.count);
  }, [rows, activationsQ.data, employeesQ.data]);

  const allocated = useMemo(() => byEmployee.reduce((s, e) => s + e.count, 0), [byEmployee]);


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
      let entryId: string | undefined = v.id;
      if (entryId) {
        const { error } = await supabase.from("daily_lead_entries").update(payload).eq("id", entryId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("daily_lead_entries").insert(payload).select("id").single();
        if (error) throw error;
        entryId = data.id;
      }

      // Replace attribution rows
      const splits: Split[] = (v.splits ?? []).filter(
        (s: Split) => s.employee_id && Number(s.activated_count) > 0,
      );
      const { error: delErr } = await supabase
        .from("daily_lead_activations").delete().eq("entry_id", entryId!);
      if (delErr) throw delErr;
      if (splits.length > 0) {
        const { error: insErr } = await supabase.from("daily_lead_activations").insert(
          splits.map((s) => ({
            entry_id: entryId!,
            employee_id: s.employee_id,
            conversion_employee_id: s.conversion_employee_id || null,
            activated_count: Number(s.activated_count) || 0,
            lead_name: s.lead_name?.trim() || null,
            potential: s.potential || null,
          })),
        );
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-leads-v2"] });
      qc.invalidateQueries({ queryKey: ["daily-lead-activations"] });
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
            <EntryDialog
              key={editing?.id ?? "new"}
              entry={editing}
              sources={sourcesQ.data ?? []}
              employees={employeesQ.data ?? []}
              existingSplits={
                editing ? (activationsByEntry.get(editing.id) ?? []).flatMap((a) =>
                  Array.from({ length: Math.max(1, a.activated_count) }, (_, i) => ({
                    id: i === 0 ? a.id : undefined,
                    employee_id: a.employee_id,
                    conversion_employee_id: a.conversion_employee_id ?? "",
                    activated_count: 1,
                    lead_name: a.lead_name ?? "",
                    potential: a.potential ?? "",
                  })),
                ) : []
              }
              onSubmit={(v) => upsert.mutate(v)}
              loading={upsert.isPending}
            />
          </Dialog>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <DateRangePicker
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
        />
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 w-[220px] justify-between font-normal">
                <span className="truncate">
                  {sourceFilter.length === 0
                    ? "All affiliates"
                    : sourceFilter.length === 1
                      ? (sourcesQ.data ?? []).find((s: any) => s.id === sourceFilter[0])?.name ?? "1 selected"
                      : `${sourceFilter.length} affiliates`}
                </span>
                <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                  {sourceFilter.length === 0 ? "All" : String(sourceFilter.length)}
                </Badge>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2" align="end">
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                  <Checkbox
                    checked={sourceFilter.length === 0}
                    onCheckedChange={() => setSourceFilter([])}
                  />
                  <span className="text-sm">All affiliates</span>
                </label>
                <div className="h-px bg-border" />
                {(sourcesQ.data ?? []).map((s: any) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                    <Checkbox
                      checked={sourceFilter.includes(s.id)}
                      onCheckedChange={(checked) => {
                        setSourceFilter((prev) =>
                          checked
                            ? [...prev.filter((id) => id !== s.id), s.id]
                            : prev.filter((id) => id !== s.id)
                        );
                      }}
                    />
                    <span className="text-sm">{s.name}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <div className="text-xs text-muted-foreground">{activeRange.label}</div>
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-8 gap-3 mb-6">
        <StatCard label="Received" value={String(stats.received)} />
        <StatCard label="Activated" value={String(stats.activated)} tone="positive" />
        <StatCard
          label="Allocated"
          value={`${allocated} / ${stats.activated}`}
          tone={allocated < stats.activated ? "negative" : "positive"}
        />
        <StatCard label="Reported" value={String(stats.reported)} />
        <StatCard label="Unreported" value={String(stats.unreported)} />
        <StatCard label="Conv. rate" value={fmtPct(stats.rate)} />
        <StatCard label="Total cost" value={fmtMoney(stats.totalCost)} />
        <StatCard label="Saved (CPA)" value={fmtMoney(stats.cpaSavings)} tone="positive" />
      </section>


      <div className="card-surface p-4 mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Activated leads by employee</h3>
          <span className="text-xs text-muted-foreground">{activeRange.label}</span>
        </div>
        {byEmployee.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No employee attributions yet. Open an entry and assign activated leads to employees.
          </p>
        ) : (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 px-3">Employee</th>
                  <th className="py-2 px-3">Activated leads</th>
                  <th className="py-2 px-3">Share</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((e) => {
                  const totalAttributed = byEmployee.reduce((s, x) => s + x.count, 0);
                  const pct = totalAttributed ? (e.count / totalAttributed) * 100 : 0;
                  return (
                    <tr key={e.id} className="border-b border-border/50">
                      <td className="py-2 px-3 font-medium">{e.name}</td>
                      <td className="py-2 px-3">{e.count}</td>
                      <td className="py-2 px-3 text-muted-foreground">{fmtPct(pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-xs">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <SortTh label="Date" k="date" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Source" k="source" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Model" k="model" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Received" k="received" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Activated" k="activated" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Reported" k="reported" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Expected %" k="expected" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Reported %" k="reportedPct" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Activated %" k="activatedPct" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Cost" k="cost" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <SortTh label="Savings" k="savings" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <th className="py-2.5 px-2">Attribution</th>
                  <SortTh label="Notes" k="notes" sort={sort} toggle={toggle} className="py-2.5 px-2" />
                  <th className="py-2.5 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r: any) => {
                  const s = r.lead_sources;
                  const p = s ? Number(s.price) : 0;
                  const cost = !s ? 0
                    : s.pricing_model === "CPL" ? p * r.received
                    : p * r.reported;
                  const savings = s?.pricing_model === "CPA" ? p * Math.max(0, r.activated - r.reported) : 0;
                  const splits = activationsByEntry.get(r.id) ?? [];
                  const attrSum = splits.reduce((a, b) => a + b.activated_count, 0);
                  const attrLabel = splits.length === 0
                    ? "—"
                    : splits.map((sp) => `${sp.lead_name ? `${sp.lead_name}: ` : ""}R ${employeeName(sp.employee_id)}${sp.conversion_employee_id ? ` · C ${employeeName(sp.conversion_employee_id)}` : ""} (${sp.activated_count})`).join(" · ");
                  return (
                    <tr key={r.id} className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                        onClick={() => { setEditing(r); setOpen(true); }}>
                      <td className="py-2.5 px-2 font-medium">{fmtDate(r.entry_date)}</td>
                      <td className="py-2.5 px-2">{s?.name ?? "—"}</td>
                      <td className="py-2.5 px-2">{s ? <PricingBadge model={s.pricing_model} /> : "—"}</td>
                      <td className="py-2.5 px-2">{r.received}</td>
                      <td className="py-2.5 px-2">{r.activated}</td>
                      <td className="py-2.5 px-2">{r.reported}</td>
                      <td className="py-2.5 px-2">{s?.expected_conversion_rate ? fmtPct(Number(s.expected_conversion_rate)) : "—"}</td>
                      <td className="py-2.5 px-2">{r.received ? fmtPct((r.reported / r.received) * 100) : "—"}</td>
                      <td className="py-2.5 px-2">{r.received ? fmtPct((r.activated / r.received) * 100) : "—"}</td>
                      <td className="py-2.5 px-2">{fmtMoney(cost)}</td>
                      <td className="py-2.5 px-2 text-emerald-500">{s?.pricing_model === "CPA" ? fmtMoney(savings) : "—"}</td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground max-w-[11rem] truncate">
                        {attrLabel}
                        {splits.length > 0 && attrSum !== r.activated && (
                          <span className="ml-1 text-amber-500">({attrSum}/{r.activated})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground truncate max-w-[9rem]">{r.notes || "—"}</td>
                      <td className="py-2.5 px-2 text-right" onClick={(e) => e.stopPropagation()}>
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
  entry, sources, employees, existingSplits, onSubmit, loading,
}: {
  entry: Entry | null;
  sources: any[];
  employees: { id: string; name: string; active: boolean; team?: string | null }[];
  existingSplits: Split[];
  onSubmit: (v: any) => void;
  loading: boolean;
}) {
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
  const [splits, setSplits] = useState<Split[]>(existingSplits);

  // Auto-seed one row per activated lead
  useEffect(() => {
    if (form.activated > 0 && splits.length === 0) {
      setSplits(
        Array.from({ length: form.activated }, () => ({
          employee_id: "", conversion_employee_id: "", activated_count: 1, lead_name: "", potential: "",
        })),
      );
    }
  }, [form.activated]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = sources.find((s) => s.id === form.source_id);
  const splitSum = splits.length;
  const remainder = form.activated - splitSum;
  const validSplits = form.activated === 0 || splitSum === form.activated;
  // Only flag as duplicate when the same employee has the same non-empty lead name twice
  const dupKeys = splits
    .filter((s) => s.employee_id && (s.lead_name ?? "").trim())
    .map((s) => `${s.employee_id}|${(s.lead_name ?? "").trim().toLowerCase()}`);
  const dupEmployees = new Set(dupKeys).size !== dupKeys.length;


  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scroll-slim">
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

        {form.activated > 0 && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Activated leads — retention (R), conversion (C), lead name and potential</Label>
              <span className={`text-xs ${validSplits ? "text-muted-foreground" : "text-amber-500"}`}>
                {splitSum} / {form.activated}
                {remainder !== 0 && ` (${remainder > 0 ? "+" : ""}${remainder})`}
              </span>
            </div>
            {splits.map((sp, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={sp.employee_id || "_none"}
                  onValueChange={(v) => {
                    const copy = [...splits];
                    copy[i] = { ...copy[i], employee_id: v === "_none" ? "" : v };
                    setSplits(copy);
                  }}
                >
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Retention" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Retention…</SelectItem>
                    {employees
                      .filter((emp) => (emp.team ?? "R") === "R" || emp.id === sp.employee_id)
                      .map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sp.conversion_employee_id || "_none"}
                  onValueChange={(v) => {
                    const copy = [...splits];
                    copy[i] = { ...copy[i], conversion_employee_id: v === "_none" ? "" : v };
                    setSplits(copy);
                  }}
                >
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Conversion" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Conversion…</SelectItem>
                    {employees
                      .filter((emp) => (emp.team ?? "C") === "C" || emp.id === sp.conversion_employee_id)
                      .map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Lead name"
                  className="flex-1"
                  value={sp.lead_name ?? ""}
                  onChange={(e) => {
                    const copy = [...splits];
                    copy[i] = { ...copy[i], lead_name: e.target.value };
                    setSplits(copy);
                  }}
                />
                <Select
                  value={sp.potential || "_none"}
                  onValueChange={(v) => {
                    const copy = [...splits];
                    copy[i] = { ...copy[i], potential: v === "_none" ? "" : v };
                    setSplits(copy);
                  }}
                >
                  <SelectTrigger className="w-[110px]"><SelectValue placeholder="Potential" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Potential…</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="mid">Mid</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon"
                  onClick={() => setSplits(splits.filter((_, idx) => idx !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm"
                onClick={() => setSplits([...splits, { employee_id: "", conversion_employee_id: "", activated_count: 1, lead_name: "", potential: "" }])}>
                <Plus className="h-3 w-3" /> Add lead
              </Button>
              {dupEmployees && <span className="text-xs text-amber-500">Duplicate employee + lead name</span>}
            </div>
          </div>
        )}

        <Field label="Notes (optional)">
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <DialogFooter>
        <Button
          onClick={() => onSubmit({ ...form, splits })}
          disabled={loading || !validSplits || dupEmployees}
        >
          {loading ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
