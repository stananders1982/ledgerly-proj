import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCog } from "lucide-react";
import { ActiveBadge, StatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { IssueFilterBanner } from "@/components/issue-filter-banner";
import { useCan } from "@/lib/permissions";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { EmptyState } from "@/components/empty-state";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";

export const Route = createFileRoute("/_authenticated/employees/")({
  validateSearch: (search: Record<string, unknown>) => ({
    issue: typeof search.issue === "string" ? search.issue : undefined,
  }),
  head: () => ({ meta: [{ title: "Employees — Ledgerly" }] }),
  component: EmployeesPage,
});

type Emp = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  team: string;
  salary: number;
  commission_pct: number;
  active: boolean;
  commission_tier1_max: number;
  commission_tier1_pct: number;
  commission_tier2_max: number;
  commission_tier2_pct: number;
  commission_tier3_pct: number;
  ftd_commission: number;
  target_ftds: number | null;
  target_stds: number | null;
  target_revenue: number | null;
};

const TEAMS = [
  { value: "R", label: "R — Retention" },
  { value: "C", label: "C — Conversion (activations)" },
  { value: "M", label: "M — Management" },
];

function EmployeesPage() {
  const can = useCan();
  const { isAdmin } = useAuth();
  const canSeeSalaries = isAdmin || can("view_salaries");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Emp | null>(null);

  const q = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Emp[];
    },
  });

  const { issue } = Route.useSearch();
  const navigate = Route.useNavigate();

  const rows = useMemo(() => {
    const rank: Record<string, number> = { C: 0, R: 1, M: 2 };
    const base = (q.data ?? []).filter((e) => {
      if (!issue) return true;
      if (e.active === false) return false;
      if (issue === "employees-no-team") return !e.team;
      if (issue === "employees-no-salary") return !Number(e.salary);
      return true;
    });
    return [...base].sort(
      (a, b) =>
        (rank[String(a.team ?? "C").toUpperCase()] ?? 3) - (rank[String(b.team ?? "C").toUpperCase()] ?? 3) ||
        a.name.localeCompare(b.name),
    );
  }, [q.data, issue]);
  const { sorted, sort, toggle } = useSort<any>(rows, {
    name: (e) => e.name ?? "",
    role: (e) => e.role ?? "",
    team: (e) => e.team ?? "C",
    email: (e) => e.email ?? "",
    salary: (e) => Number(e.salary ?? 0),
    active: (e) => !!e.active,
  });
  const { pageItems, ...pg } = usePagination(sorted, 30);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        email: v.email || null,
        role: v.role || null,
        team: v.team || "C",
        salary: Number(v.salary) || 0,
        commission_pct: Number(v.commission_pct) || 0,
        active: !!v.active,
        commission_tier1_max: Number(v.commission_tier1_max) || 0,
        commission_tier1_pct: Number(v.commission_tier1_pct) || 0,
        commission_tier2_max: Number(v.commission_tier2_max) || 0,
        commission_tier2_pct: Number(v.commission_tier2_pct) || 0,
        commission_tier3_pct: Number(v.commission_tier3_pct) || 0,
        ftd_commission: Number(v.ftd_commission) || 0,
        target_ftds: v.target_ftds === "" || v.target_ftds == null ? null : Number(v.target_ftds),
        target_stds: v.target_stds === "" || v.target_stds == null ? null : Number(v.target_stds),
        target_revenue: v.target_revenue === "" || v.target_revenue == null ? null : Number(v.target_revenue),
      };
      if (v.id) {
        const { error } = await supabase.from("employees").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Deleted");
    },
  });

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Team members with base salary and commission percentage."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add employee</Button>
            </DialogTrigger>
            <EmpDialog key={editing?.id ?? "new"} emp={editing} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
          </Dialog>
        }
      />

      {!canSeeSalaries && (
        <div className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 text-sm text-muted-foreground">
          You don&apos;t have permission to view salaries, so employee records are hidden here. Ask an
          admin to enable &ldquo;View salaries&rdquo;.
        </div>
      )}

      {issue && (
        <IssueFilterBanner
          issue={issue}
          count={rows.length}
          onClear={() => navigate({ search: (prev: any) => ({ ...prev, issue: undefined }), replace: true })}
        />
      )}

      <div className="card-surface overflow-hidden">
        {q.isLoading ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No employees yet"
            description="Add your first team member."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add employee</Button>}
          />
        ) : (
          <>
          <DataCardList>
            {pageItems.map((e: any) => (
              <DataCard
                key={e.id}
                title={e.name}
                subtitle={e.role || undefined}
                onClick={() => { setEditing(e); setOpen(true); }}
                actions={<Link to="/employees/$id" params={{ id: e.id }} className="text-primary hover:underline text-xs">View</Link>}
                fields={[
                  { label: "Team", value: <StatusBadge tone="info">{e.team ?? "C"}</StatusBadge> },
                  { label: "Salary", value: <span className="num">{fmtMoney(e.salary)}</span> },
                  { label: "Email", value: e.email || "—" },
                  { label: "Status", value: <ActiveBadge active={!!e.active} /> },
                ]}
              />
            ))}
          </DataCardList>
          <div className="hidden md:block overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <SortTh label="Name" k="name" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Role" k="role" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Team" k="team" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Email" k="email" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <SortTh label="Base salary" k="salary" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <th className="py-3 px-4"></th>
                  <SortTh label="Active" k="active" sort={sort} toggle={toggle} className="py-3 px-4" />
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((e: any) => (
                  <tr key={e.id} className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(e); setOpen(true); }}>
                    <td className="py-3 px-4 font-medium">{e.name}</td>
                    <td className="py-3 px-4">{e.role || "—"}</td>
                    <td className="py-3 px-4">
                      <StatusBadge tone="info">{e.team ?? "C"}</StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{e.email || "—"}</td>
                    <td className="py-3 px-4">{fmtMoney(e.salary)}</td>
                    <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                      ≤{fmtMoney(e.commission_tier1_max)}: <span className="text-foreground font-medium">{Number(e.commission_tier1_pct)}%</span>
                      {" · "}
                      ≤{fmtMoney(e.commission_tier2_max)}: <span className="text-foreground font-medium">{Number(e.commission_tier2_pct)}%</span>
                      {" · "}
                      &gt;{fmtMoney(e.commission_tier2_max)}: <span className="text-foreground font-medium">{Number(e.commission_tier3_pct)}%</span>
                    </td>
                    <td className="py-3 px-4"><ActiveBadge active={!!e.active} /></td>
                    <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                      <button type="button" className="text-primary hover:underline text-xs mr-3"
                        onClick={() => { setEditing(e); setOpen(true); }}>Edit</button>
                      <Link to="/employees/$id" params={{ id: e.id }} className="text-primary hover:underline text-xs mr-3">View</Link>
                      <ConfirmDelete onConfirm={() => del.mutate(e.id)} label="Delete employee?" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pg} />
          </>
        )}
      </div>
    </div>
  );
}

function EmpDialog({
  emp, onSubmit, loading,
}: { emp: Emp | null; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: emp?.id,
    name: emp?.name ?? "",
    email: emp?.email ?? "",
    role: emp?.role ?? "",
    team: emp?.team ?? "C",
    salary: emp?.salary ?? 0,
    commission_pct: emp?.commission_pct ?? 0,
    active: emp?.active ?? true,
    commission_tier1_max: emp?.commission_tier1_max ?? 50000,
    commission_tier1_pct: emp?.commission_tier1_pct ?? 8,
    commission_tier2_max: emp?.commission_tier2_max ?? 250000,
    commission_tier2_pct: emp?.commission_tier2_pct ?? 10,
    commission_tier3_pct: emp?.commission_tier3_pct ?? 12,
    ftd_commission: emp?.ftd_commission ?? 100,
    target_ftds: emp?.target_ftds ?? "",
    target_stds: emp?.target_stds ?? "",
    target_revenue: emp?.target_revenue ?? "",
  }));
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{emp?.id ? "Edit employee" : "New employee"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Team">
          <Select value={form.team} onValueChange={(v) => setForm({ ...form, team: v })}>
            <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
            <SelectContent>
              {TEAMS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {form.team === "C" && (
          <Field label="FTD commission ($ per qualified FTD)">
            <Input type="number" min={0} step="0.01" value={form.ftd_commission}
              onChange={(e) => setForm({ ...form, ftd_commission: Number(e.target.value) })} />
          </Field>
        )}
        <Field label="Base salary">
          <Input type="number" min={0} step="0.01" value={form.salary}
            onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} />
        </Field>

        <div className="rounded-md border border-border p-3 grid gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Commission tiers</Label>
            <span className="text-xs text-muted-foreground">Based on monthly revenue · flat by bracket</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Tier 1 up to">
              <Input type="number" min={0} step="1" value={form.commission_tier1_max}
                onChange={(e) => setForm({ ...form, commission_tier1_max: Number(e.target.value) })} />
            </Field>
            <span className="pb-2 text-muted-foreground">→</span>
            <Field label="Rate %">
              <Input type="number" min={0} step="0.01" value={form.commission_tier1_pct}
                onChange={(e) => setForm({ ...form, commission_tier1_pct: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Tier 2 up to">
              <Input type="number" min={0} step="1" value={form.commission_tier2_max}
                onChange={(e) => setForm({ ...form, commission_tier2_max: Number(e.target.value) })} />
            </Field>
            <span className="pb-2 text-muted-foreground">→</span>
            <Field label="Rate %">
              <Input type="number" min={0} step="0.01" value={form.commission_tier2_pct}
                onChange={(e) => setForm({ ...form, commission_tier2_pct: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Tier 3 above">
              <Input type="number" value={form.commission_tier2_max} disabled />
            </Field>
            <span className="pb-2 text-muted-foreground">→</span>
            <Field label="Rate %">
              <Input type="number" min={0} step="0.01" value={form.commission_tier3_pct}
                onChange={(e) => setForm({ ...form, commission_tier3_pct: Number(e.target.value) })} />
            </Field>
          </div>
        </div>

        <div className="grid gap-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Monthly goals</Label>
            <span className="text-xs text-muted-foreground">Leave empty for no target</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="FTDs">
              <Input type="number" min={0} value={form.target_ftds}
                onChange={(e) => setForm({ ...form, target_ftds: e.target.value })} />
            </Field>
            <Field label="STDs">
              <Input type="number" min={0} value={form.target_stds}
                onChange={(e) => setForm({ ...form, target_stds: e.target.value })} />
            </Field>
            <Field label="Revenue">
              <Input type="number" min={0} step="0.01" value={form.target_revenue}
                onChange={(e) => setForm({ ...form, target_revenue: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <Label className="text-sm">Active</Label>
          <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.name}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
