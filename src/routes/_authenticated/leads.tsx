import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Download } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { Users } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCSV, exportPDF, exportXLSX } from "@/lib/export";
import { StatCard } from "@/components/stat-card";

const STATUSES = ["new", "contacted", "qualified", "activated", "lost"] as const;
type Status = (typeof STATUSES)[number];
const statusTone: Record<Status, string> = {
  new: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  contacted: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  qualified: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  activated: "bg-primary/20 text-primary border-primary/30",
  lost: "bg-destructive/20 text-destructive border-destructive/30",
};

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Ledgerly" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const leadsQ = useQuery({
    queryKey: ["leads-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, lead_sources(name), employees(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const sourcesQ = useQuery({
    queryKey: ["sources"],
    queryFn: async () => (await supabase.from("lead_sources").select("*").order("name")).data ?? [],
  });
  const employeesQ = useQuery({
    queryKey: ["employees"],
    queryFn: async () => (await supabase.from("employees").select("*").order("name")).data ?? [],
  });

  const filtered = useMemo(() => {
    const list = leadsQ.data ?? [];
    return list.filter((l: any) => {
      if (filterSource !== "all" && l.source_id !== filterSource) return false;
      if (filterEmployee !== "all" && l.employee_id !== filterEmployee) return false;
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(l.name?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.phone?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [leadsQ.data, filterSource, filterEmployee, filterStatus, search]);

  const stats = useMemo(() => {
    const list = filtered;
    const total = list.length;
    const activated = list.filter((l: any) => l.status === "activated").length;
    const cost = list.reduce((s: number, l: any) => s + Number(l.cost), 0);
    return {
      total, activated,
      rate: total ? (activated / total) * 100 : 0,
      cost,
    };
  }, [filtered]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        phone: v.phone || null,
        email: v.email || null,
        source_id: v.source_id || null,
        employee_id: v.employee_id || null,
        cost: Number(v.cost) || 0,
        status: v.status,
        notes: v.notes || null,
      };
      if (v.id) {
        const { error } = await supabase.from("leads").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leads").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads-list"] });
      toast.success("Deleted");
    },
  });

  const handleExport = (type: "csv" | "xlsx" | "pdf") => {
    const rows = filtered.map((l: any) => ({
      Name: l.name, Phone: l.phone, Email: l.email,
      Source: l.lead_sources?.name ?? "", Employee: l.employees?.name ?? "",
      Cost: l.cost, Status: l.status, Created: fmtDate(l.created_at),
    }));
    if (!rows.length) return toast.error("Nothing to export");
    if (type === "csv") exportCSV(rows, "leads");
    else if (type === "xlsx") exportXLSX(rows, "leads", "Leads");
    else exportPDF("Leads", rows, "leads");
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Capture, qualify, and convert prospective customers."
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
                <Button><Plus className="h-4 w-4" /> New lead</Button>
              </DialogTrigger>
              <LeadDialog
                lead={editing}
                sources={sourcesQ.data ?? []}
                employees={employeesQ.data ?? []}
                onSubmit={(v) => upsert.mutate(v)}
                loading={upsert.isPending}
              />
            </Dialog>
          </div>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total leads" value={String(stats.total)} />
        <StatCard label="Activated" value={String(stats.activated)} tone="positive" />
        <StatCard label="Activation rate" value={fmtPct(stats.rate)} />
        <StatCard label="Lead spend" value={fmtMoney(stats.cost)} />
      </section>

      <div className="card-surface overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-2 p-3 border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, email, phone…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="lg:w-40"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sourcesQ.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterEmployee} onValueChange={setFilterEmployee}>
            <SelectTrigger className="lg:w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employeesQ.data?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="lg:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {leadsQ.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads match"
            description="Adjust filters or add your first lead to get started."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New lead</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l: any) => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(l); setOpen(true); }}>
                    <td className="py-3 px-4 font-medium">{l.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      <div className="text-xs">{l.email || "—"}</div>
                      <div className="text-xs">{l.phone || ""}</div>
                    </td>
                    <td className="py-3 px-4">{l.lead_sources?.name || "—"}</td>
                    <td className="py-3 px-4">{l.employees?.name || "—"}</td>
                    <td className="py-3 px-4">{fmtMoney(l.cost)}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={`capitalize ${statusTone[l.status as Status]}`}>{l.status}</Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(l.created_at)}</td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(l.id)} label="Delete lead?" />
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
}: { lead: any; sources: any[]; employees: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: lead?.id,
    name: lead?.name ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    source_id: lead?.source_id ?? "",
    employee_id: lead?.employee_id ?? "",
    cost: lead?.cost ?? "",
    status: (lead?.status ?? "new") as Status,
    notes: lead?.notes ?? "",
  }));
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{lead?.id ? "Edit lead" : "New lead"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <Select value={form.source_id} onValueChange={(v) => setForm({ ...form, source_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick source" /></SelectTrigger>
              <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Assigned employee">
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost"><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
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
