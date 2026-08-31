import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { usePagination, TablePagination } from "@/components/pagination";
import { useSort, SortTh } from "@/components/sortable-table";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CheckCircle2, ListTodo, Plus, AlarmClock, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runClientAutomation } from "@/lib/automation.functions";
import { useAuth } from "@/lib/auth-context";

const sb = supabase as any;

import { useQuickCreate } from "@/lib/quick-create";
import { QueryError } from "@/components/query-error";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks & Follow-ups — Ledgerly" },
      { name: "description", content: "Follow-up reminders and team to-dos linked to clients and agents." },
      { property: "og:title", content: "Tasks & Follow-ups — Ledgerly" },
      { property: "og:description", content: "Follow-up reminders and team to-dos linked to clients and agents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

type Task = {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  employee_id: string | null;
  activation_id: string | null;
  client_name: string | null;
  completed_at: string | null;
};

const PRIORITIES = ["low", "normal", "high"] as const;
const today = () => new Date().toISOString().slice(0, 10);

function PriorityBadge({ p }: { p: string }) {
  const tone =
    p === "high" ? "border-rose-500/40 text-rose-600 dark:text-rose-400"
      : p === "low" ? "border-muted-foreground/40 text-muted-foreground"
        : "border-sky-500/40 text-sky-600 dark:text-sky-400";
  return <Badge variant="outline" className={cn("capitalize", tone)}>{p}</Badge>;
}

function TasksPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useQuickCreate("tasks", () => setOpen(true));
  const [editing, setEditing] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const data = await fetchAll(() => sb.from("tasks").select("*").order("due_date", { ascending: true }));
      return (data ?? []) as Task[];
    },
  });

  const empQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean }[];
    },
  });

  const clientsQ = useQuery({
    queryKey: ["tasks-clients"],
    queryFn: async () => {
      const data = await fetchAll(() => sb
        .from("daily_lead_activations")
        .select("id,lead_name")
        .order("created_at", { ascending: false }));
      return ((data ?? []) as any[]).filter((c) => !!c.lead_name);
    },
  });

  const empName = (id?: string | null) => (empQ.data ?? []).find((e) => e.id === id)?.name ?? "—";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? []).filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (term && !`${t.title} ${t.client_name ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [q.data, statusFilter, search]);

  const { sorted, sort, toggle } = useSort<any>(rows, {
    title: (t) => t.title ?? "",
    due: (t) => t.due_date ?? "9999-12-31",
    priority: (t) => ({ high: 3, normal: 2, low: 1 } as any)[t.priority] ?? 0,
    client: (t) => t.client_name ?? "",
    owner: (t) => empName(t.employee_id),
    status: (t) => t.status,
  });
  const { pageItems, ...pg } = usePagination(sorted, 30, "tasks");

  const stats = useMemo(() => {
    const all = q.data ?? [];
    const openTasks = all.filter((t) => t.status === "open");
    return {
      open: openTasks.length,
      overdue: openTasks.filter((t) => t.due_date && t.due_date < today()).length,
      dueToday: openTasks.filter((t) => t.due_date === today()).length,
      done: all.filter((t) => t.status === "done").length,
    };
  }, [q.data]);

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        title: v.title.trim(),
        notes: v.notes?.trim() || null,
        due_date: v.due_date || null,
        priority: v.priority,
        status: v.status,
        employee_id: v.employee_id || null,
        activation_id: v.activation_id || null,
        client_name: v.client_name || null,
        completed_at: v.status === "done" ? new Date().toISOString() : null,
      };
      if (v.id) {
        const { error } = await sb.from("tasks").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("tasks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await sb
        .from("tasks")
        .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Client-care sweep: opens follow-up tasks for clients who have gone quiet.
  // Runs at most once a day; the server enforces the lock and the daily limit.
  const { isAdmin } = useAuth();
  const runSweep = useServerFn(runClientAutomation);
  const sweep = useMutation({
    mutationFn: () => runSweep({ data: undefined } as any),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      if (res?.created) toast.success(`Opened ${res.created} follow-up task${res.created === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const swept = useRef(false);
  useEffect(() => {
    if (!isAdmin || swept.current) return;
    swept.current = true;
    sweep.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  return (
    <div>
      <PageHeader
        title="Tasks & Follow-ups"
        description="Reminders for client follow-ups and internal to-dos."
        actions={
          <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" disabled={sweep.isPending} onClick={() => sweep.mutate()}>
              <Sparkles className="h-4 w-4" /> {sweep.isPending ? "Checking…" : "Find quiet clients"}
            </Button>
          )}
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> New task</Button>
            </DialogTrigger>
            <TaskDialog
              key={editing?.id ?? "new"}
              task={editing}
              employees={empQ.data ?? []}
              clients={clientsQ.data ?? []}
              loading={upsert.isPending}
              onSubmit={(v) => upsert.mutate(v)}
            />
          </Dialog>
          </div>
        }
      />

      <section className="mb-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={String(stats.open)} icon={ListTodo} />
        <StatCard label="Overdue" value={String(stats.overdue)} icon={AlarmClock} tone={stats.overdue ? "negative" : "default"} />
        <StatCard label="Due today" value={String(stats.dueToday)} />
        <StatCard label="Completed" value={String(stats.done)} icon={CheckCircle2} tone="positive" />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tasks…" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="done">Completed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="card-surface overflow-hidden">
        {q.error ? (
          <QueryError error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <TableSkeleton cols={6} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="No tasks"
            description="Create a follow-up reminder for a client or an internal to-do."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New task</Button>}
          />
        ) : (
          <>
            <DataCardList>
              {pageItems.map((t: Task) => (
                <DataCard
                  key={t.id}
                  title={t.title}
                  subtitle={t.client_name || undefined}
                  onClick={() => { setEditing(t); setOpen(true); }}
                  fields={[
                    { label: "Due", value: t.due_date ? fmtDate(t.due_date) : "—" },
                    { label: "Priority", value: <PriorityBadge p={t.priority} /> },
                    { label: "Owner", value: empName(t.employee_id) },
                    { label: "Status", value: t.status === "done" ? "Completed" : "Open" },
                  ]}
                />
              ))}
            </DataCardList>
            <div className="hidden md:block overflow-x-auto scroll-slim">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-head border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4 w-10"></th>
                    <SortTh label="Task" k="title" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <SortTh label="Client" k="client" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <SortTh label="Owner" k="owner" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <SortTh label="Due" k="due" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <SortTh label="Priority" k="priority" sort={sort} toggle={toggle} className="py-3 px-4" />
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((t: Task) => {
                    const overdue = t.status === "open" && t.due_date && t.due_date < today();
                    return (
                      <tr
                        key={t.id}
                        className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/30"
                        onClick={() => { setEditing(t); setOpen(true); }}
                      >
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={t.status === "done"}
                            onCheckedChange={(c) => setStatus.mutate({ id: t.id, status: c ? "done" : "open" })}
                            aria-label="Toggle completed"
                          />
                        </td>
                        <td className={cn("py-3 px-4 font-medium", t.status === "done" && "text-muted-foreground line-through")}>
                          {t.title}
                          {t.notes && <p className="text-xs font-normal text-muted-foreground">{t.notes}</p>}
                        </td>
                        <td className="py-3 px-4">{t.client_name || "—"}</td>
                        <td className="py-3 px-4 text-muted-foreground">{empName(t.employee_id)}</td>
                        <td className={cn("py-3 px-4", overdue && "text-rose-500 font-medium")}>
                          {t.due_date ? fmtDate(t.due_date) : "—"}
                        </td>
                        <td className="py-3 px-4"><PriorityBadge p={t.priority} /></td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <ConfirmDelete onConfirm={() => del.mutate(t.id)} label="Delete task?" />
                        </td>
                      </tr>
                    );
                  })}
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

function TaskDialog({
  task, employees, clients, loading, onSubmit,
}: {
  task: Task | null;
  employees: { id: string; name: string }[];
  clients: { id: string; lead_name: string | null }[];
  loading: boolean;
  onSubmit: (v: any) => void;
}) {
  const [form, setForm] = useState(() => ({
    id: task?.id,
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    due_date: task?.due_date ?? today(),
    priority: task?.priority ?? "normal",
    status: task?.status ?? "open",
    employee_id: task?.employee_id ?? "",
    activation_id: task?.activation_id ?? "",
    client_name: task?.client_name ?? "",
  }));

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{task?.id ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Title</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Call client about deposit" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Due date</Label>
            <Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Client (optional)</Label>
          <Select
            value={form.activation_id || "_none"}
            onValueChange={(v) => {
              const c = clients.find((x) => x.id === v);
              setForm({ ...form, activation_id: v === "_none" ? "" : v, client_name: c?.lead_name ?? "" });
            }}
          >
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="_none">—</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.lead_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Owner (optional)</Label>
          <Select value={form.employee_id || "_none"} onValueChange={(v) => setForm({ ...form, employee_id: v === "_none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="_none">—</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Notes</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="done">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={loading || !form.title.trim()} onClick={() => onSubmit(form)}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
