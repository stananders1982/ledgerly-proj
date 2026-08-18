import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, Plus, Trash2, TrendingUp, Users, Tag, Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/table-skeleton";
import { EmptyState } from "@/components/empty-state";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/format";
import {
  GOAL_METRIC_LABELS,
  GOAL_ENTITY_LABELS,
  thisMonth,
  fetchGoals,
  upsertGoal,
  deleteGoal,
  type Goal,
  type GoalEntityType,
  type GoalMetric,
} from "@/lib/goals";
import { toast } from "sonner";
import { QueryError } from "@/components/query-error";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/goals")({
  component: GoalsPage,
  head: () => ({
    meta: [
      { title: "Goals | Ledgerly" },
      { name: "description", content: "Set monthly targets for revenue, activations, and source performance." },
      { property: "og:title", content: "Goals | Ledgerly" },
      { name: "twitter:title", content: "Goals | Ledgerly" },
      { property: "og:description", content: "Set monthly targets for revenue, activations, and source performance." },
      { name: "twitter:description", content: "Set monthly targets for revenue, activations, and source performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const metricIcons: Record<GoalMetric, typeof Target> = {
  revenue: TrendingUp,
  ftds: Target,
  stds: Users,
  activations: Target,
  deposits: TrendingUp,
};

const entityIcons: Record<GoalEntityType, typeof Target> = {
  company: Building2,
  source: Tag,
  employee: Users,
};

function GoalsPage() {
  const { companyId, user } = useAuth();
  const [period, setPeriod] = useState(thisMonth());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Goal>>({
    entity_type: "company",
    target_metric: "revenue",
    target_value: 0,
    period_month: period,
  });

  useEffect(() => {
    setForm((f) => ({ ...f, period_month: period }));
  }, [period]);

  const { data: goals, isLoading, error, refetch } = useQuery({
    queryKey: ["goals", period, companyId],
    queryFn: async () => {
      const { data, error } = await fetchGoals(period);
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });

  const { data: employees } = useQuery({
    queryKey: ["goals-employees", companyId],
    queryFn: async () => {
      const { data, error } = await sb.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean; team: string }[];
    },
  });

  const { data: sources } = useQuery({
    queryKey: ["goals-sources", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("lead_sources").select("id,name").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<GoalEntityType, Goal[]>();
    for (const g of goals ?? []) {
      const list = map.get(g.entity_type) ?? [];
      list.push(g);
      map.set(g.entity_type, list);
    }
    return map;
  }, [goals]);

  const namedEntity = (g: Goal) => {
    if (g.entity_type === "company") return "Company";
    if (g.entity_type === "employee") {
      const e = (employees ?? []).find((x) => x.id === g.entity_id);
      return e?.name ?? "Unknown employee";
    }
    if (g.entity_type === "source") {
      const s = (sources ?? []).find((x) => x.id === g.entity_id);
      return s?.name ?? "Unknown source";
    }
    return "Unknown";
  };

  const save = async () => {
    if (!companyId) {
      toast.error("No company selected");
      return;
    }
    try {
      await upsertGoal(form as any, companyId, user?.id);
      toast.success(form.id ? "Goal updated" : "Goal created");
      setOpen(false);
      setForm({ entity_type: "company", target_metric: "revenue", target_value: 0, period_month: period });
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save goal");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteGoal(id);
      toast.success("Goal deleted");
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete goal");
    }
  };

  const entityOptions = (type: GoalEntityType) => {
    if (type === "company") return [{ id: "company", name: "Company" }];
    if (type === "employee") return (employees ?? []).map((e) => ({ id: e.id, name: e.name }));
    if (type === "source") return (sources ?? []).map((s) => ({ id: s.id, name: s.name }));
    return [];
  };

  return (
    <div className="page-fade-in">
      <PageHeader
        title="Goals & targets"
        description="Set monthly targets for the company, lead sources, and employees."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> New goal</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit goal" : "New goal"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Period</Label>
                  <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Entity type</Label>
                  <Select
                    value={form.entity_type}
                    onValueChange={(v) => setForm({ ...form, entity_type: v as GoalEntityType, entity_id: undefined })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="source">Lead source</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.entity_type !== "company" && (
                  <div className="grid gap-2">
                    <Label>Entity</Label>
                    <Select
                      value={form.entity_id ?? "__none__"}
                      onValueChange={(v) => setForm({ ...form, entity_id: v === "__none__" ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {entityOptions(form.entity_type!).map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Metric</Label>
                  <Select
                    value={form.target_metric}
                    onValueChange={(v) => setForm({ ...form, target_metric: v as GoalMetric })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Revenue</SelectItem>
                      <SelectItem value="ftds">FTDs</SelectItem>
                      <SelectItem value="stds">STDs</SelectItem>
                      <SelectItem value="activations">Activations</SelectItem>
                      <SelectItem value="deposits">Deposits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Target value</Label>
                  <Input
                    type="number"
                    min={0}
                    step={form.target_metric === "revenue" ? 100 : 1}
                    value={form.target_value ?? ""}
                    onChange={(e) => setForm({ ...form, target_value: Number(e.target.value) })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={(form.target_value ?? 0) <= 0}>
                  {form.id ? "Save changes" : "Create goal"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
        toolbar={
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-[160px]" />
          </div>
        }
      />

      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton cols={4} />
      ) : !goals?.length ? (
        <EmptyState
          icon={Target}
          title="No goals for this month"
          description="Set monthly targets for revenue, FTDs, or source activations so the dashboard can track progress."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add the first goal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-8">
          {(["company", "source", "employee"] as GoalEntityType[]).map((type) => {
            const list = grouped.get(type) ?? [];
            if (!list.length) return null;
            const Icon = entityIcons[type];
            return (
              <section key={type} className="card-surface overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                  <div className="h-8 w-8 rounded-lg bg-accent/60 flex items-center justify-center text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="font-display text-lg font-semibold">{GOAL_ENTITY_LABELS[type]}</h2>
                  <span className="ml-2 text-xs text-muted-foreground">{period}</span>
                </div>
                <div className="divide-y divide-border">
                  {list.map((g) => {
                    const MetricIcon = metricIcons[g.target_metric];
                    return (
                      <div key={g.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-accent/20 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <MetricIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{GOAL_METRIC_LABELS[g.target_metric]} — {namedEntity(g)}</div>
                            <div className="text-xs text-muted-foreground">
                              Target: {g.target_metric === "revenue" ? fmtMoney(g.target_value) : g.target_value.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setForm(g); setOpen(true); }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => remove(g.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
