import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SearchInput } from "@/components/search-input";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtDate, fmtMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { CheckCircle2, PhoneCall, Wallet } from "lucide-react";
import { useSort, SortTh } from "@/components/sortable-table";

export const Route = createFileRoute("/_authenticated/activations")({
  head: () => ({
    meta: [
      { title: "Clients — Ledgerly" },
      { name: "description", content: "Track clients with balance, potential, agents and answer status." },
      { property: "og:title", content: "Clients — Ledgerly" },
      { property: "og:description", content: "Track clients with balance, potential, agents and answer status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivationsPage,
});

type Row = {
  id: string;
  entry_id: string;
  employee_id: string;
  conversion_employee_id: string | null;
  activated_count: number;
  lead_name: string | null;
  balance: number;
  potential: "low" | "mid" | "high" | null;
  answered: boolean;
  daily_lead_entries?: { entry_date: string; source_id: string | null; lead_sources?: { name: string } | null } | null;
};

const POTENTIALS = ["low", "mid", "high"] as const;

function PotentialBadge({ value }: { value: Row["potential"] }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const variant = value === "high" ? "default" : value === "mid" ? "secondary" : "outline";
  return <Badge variant={variant} className="capitalize">{value}</Badge>;
}

function ActivationsPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [answeredFilter, setAnsweredFilter] = useState<"all" | "yes" | "no">("all");
  const [potentialFilter, setPotentialFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const activeRange = useMemo(
    () => getRange(range, { start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );

  const q = useQuery({
    queryKey: ["activated-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_activations")
        .select("*, daily_lead_entries(entry_date, source_id, lead_sources(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const employeesQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean; team?: string | null }[];
    },
  });

  const revenueQ = useQuery({
    queryKey: ["revenue-for-activations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("revenue").select("customer_name, amount");
      if (error) throw error;
      return (data ?? []) as { customer_name: string | null; amount: number }[];
    },
  });

  const depositsByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of revenueQ.data ?? []) {
      const k = (r.customer_name ?? "").trim().toLowerCase();
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + Number(r.amount || 0));
    }
    return m;
  }, [revenueQ.data]);

  const depositsFor = (name?: string | null) =>
    depositsByName.get((name ?? "").trim().toLowerCase()) ?? 0;

  const employeeName = (id?: string | null) =>
    (employeesQ.data ?? []).find((e) => e.id === id)?.name ?? "—";

  const rows = useMemo(() => {
    const s = activeRange.start.getTime();
    const e = activeRange.end.getTime();
    return (q.data ?? []).filter((r) => {
      const d = r.daily_lead_entries?.entry_date;
      if (d) {
        const t = new Date(d + "T00:00:00").getTime();
        if (t < s || t > e) return false;
      }
      if (answeredFilter === "yes" && !r.answered) return false;
      if (answeredFilter === "no" && r.answered) return false;
      if (potentialFilter !== "all" && (r.potential ?? "") !== potentialFilter) return false;
      const term = search.trim().toLowerCase();
      if (term && !(r.lead_name ?? "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [q.data, activeRange, answeredFilter, potentialFilter, search]);

  const { sorted, sort, toggle } = useSort<any>(rows, {
    date: (r) => r.daily_lead_entries?.entry_date ?? "",
    lead: (r) => r.lead_name ?? "",
    source: (r) => r.daily_lead_entries?.lead_sources?.name ?? "",
    balance: (r) => Number(r.balance || 0) + depositsFor(r.lead_name),
    potential: (r) => ({ low: 1, mid: 2, high: 3 } as any)[r.potential ?? ""] ?? 0,
    conversion: (r) => r.conversion_employee_id ?? "",
    retention: (r) => r.employee_id ?? "",
    answered: (r) => !!r.answered,
  });

  const totalBalance = rows.reduce(
    (a, r) => a + Number(r.balance || 0) + depositsFor(r.lead_name),
    0,
  );

  const answeredCount = rows.filter((r) => r.answered).length;
  const highCount = rows.filter((r) => r.potential === "high").length;

  // Conversions per conversion agent — only answered leads count
  const conversionsByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!r.answered) continue;
      const id = r.conversion_employee_id;
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, name: employeeName(id), count }))
      .sort((a, b) => b.count - a.count);
  }, [rows, employeesQ.data]);

  const save = useMutation({
    mutationFn: async (v: Row) => {
      const { error } = await supabase
        .from("daily_lead_activations")
        .update({
          lead_name: v.lead_name?.trim() || null,
          balance: Number(v.balance) || 0,
          potential: v.potential,
          answered: v.answered,
          employee_id: v.employee_id,
          conversion_employee_id: v.conversion_employee_id || null,
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      qc.invalidateQueries({ queryKey: ["daily-lead-activations"] });
      toast.success("Saved");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAnswered = useMutation({
    mutationFn: async ({ id, answered }: { id: string; answered: boolean }) => {
      const { error } = await supabase.from("daily_lead_activations").update({ answered }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activated-leads"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Every client with its balance, potential, agents and answer status."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangePicker
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search client…" />
        <Select value={answeredFilter} onValueChange={(v) => setAnsweredFilter(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All answers</SelectItem>
            <SelectItem value="yes">Answered</SelectItem>
            <SelectItem value="no">Not answered</SelectItem>
          </SelectContent>
        </Select>
        <Select value={potentialFilter} onValueChange={setPotentialFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All potentials</SelectItem>
            {POTENTIALS.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Clients" value={String(rows.length)} icon={CheckCircle2} />
        <StatCard label="Total balance" value={fmtMoney(totalBalance)} icon={Wallet} />
        <StatCard label="Answered" value={`${answeredCount} / ${rows.length}`} icon={PhoneCall} />
      </div>

      <div className="mb-6 rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Conversions by agent</h2>
          <p className="text-xs text-muted-foreground">Only answered leads are counted.</p>
        </div>
        {conversionsByAgent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No answered conversions in this range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 px-4 font-medium">Conversion agent</th>
                <th className="py-2 px-4 font-medium">Conversions</th>
              </tr>
            </thead>
            <tbody>
              {conversionsByAgent.map((a) => (
                <tr key={a.id} className="border-t border-border/50">
                  <td className="py-2 px-4">{a.name}</td>
                  <td className="py-2 px-4 font-medium">{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      <div className="rounded-lg border border-border overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No clients" description="Activated leads logged on the Leads page appear here." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <SortTh label="Date" k="date" sort={sort} toggle={toggle} className="py-3 px-4" />
                <SortTh label="Lead name" k="lead" sort={sort} toggle={toggle} className="py-3 px-4" />
                <SortTh label="Source" k="source" sort={sort} toggle={toggle} className="py-3 px-4" />
                <SortTh label="Balance" k="balance" sort={sort} toggle={toggle} className="py-3 px-4" />
                <SortTh label="Potential" k="potential" sort={sort} toggle={toggle} className="py-3 px-4" />
                <SortTh label="Conversion agent" k="conversion" sort={sort} toggle={toggle} className="py-3 px-4" />
                <SortTh label="Retention agent" k="retention" sort={sort} toggle={toggle} className="py-3 px-4" />
                <SortTh label="Answered" k="answered" sort={sort} toggle={toggle} className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr
                  key={r.id}
                  className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                  onClick={() => setEditing(r)}
                >
                  <td className="py-3 px-4">{r.daily_lead_entries?.entry_date ? fmtDate(r.daily_lead_entries.entry_date) : "—"}</td>
                  <td className="py-3 px-4 font-medium">{r.lead_name || "—"}</td>
                  <td className="py-3 px-4">{r.daily_lead_entries?.lead_sources?.name ?? "—"}</td>
                  <td className="py-3 px-4">
                    {fmtMoney(Number(r.balance || 0) + depositsFor(r.lead_name))}
                    {depositsFor(r.lead_name) > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (base {fmtMoney(Number(r.balance || 0))} + {fmtMoney(depositsFor(r.lead_name))})
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4"><PotentialBadge value={r.potential} /></td>
                  <td className="py-3 px-4">{employeeName(r.conversion_employee_id)}</td>
                  <td className="py-3 px-4">{employeeName(r.employee_id)}</td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={r.answered}
                      onCheckedChange={(c) => toggleAnswered.mutate({ id: r.id, answered: Boolean(c) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing && (
          <EditDialog
            key={editing.id}
            row={editing}
            employees={employeesQ.data ?? []}
            loading={save.isPending}
            onSubmit={(v) => save.mutate(v)}
          />
        )}
      </Dialog>
    </div>
  );
}

function EditDialog({
  row, employees, loading, onSubmit,
}: {
  row: Row;
  employees: { id: string; name: string; team?: string | null }[];
  loading: boolean;
  onSubmit: (v: Row) => void;
}) {
  const [form, setForm] = useState<Row>({ ...row });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Client</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Lead name</label>
          <Input value={form.lead_name ?? ""} onChange={(e) => setForm({ ...form, lead_name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Base balance</label>
            <Input type="number" min={0} value={form.balance ?? 0}
              onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Potential</label>
            <Select value={form.potential ?? "_none"}
              onValueChange={(v) => setForm({ ...form, potential: v === "_none" ? null : (v as Row["potential"]) })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                {POTENTIALS.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Conversion agent (Team C)</label>
          <Select value={form.conversion_employee_id || "_none"}
            onValueChange={(v) => setForm({ ...form, conversion_employee_id: v === "_none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {employees
                .filter((e) => (e.team ?? "C") === "C" || e.id === form.conversion_employee_id)
                .map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Retention agent (Team R)</label>
          <Select value={form.employee_id || "_none"}
            onValueChange={(v) => setForm({ ...form, employee_id: v === "_none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {employees
                .filter((e) => (e.team ?? "R") === "R" || e.id === form.employee_id)
                .map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.answered} onCheckedChange={(c) => setForm({ ...form, answered: Boolean(c) })} />
          Answered
        </label>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.employee_id}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
