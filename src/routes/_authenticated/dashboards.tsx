import { useState, useMemo, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Copy, Save, LayoutGrid, LayoutTemplate, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardGrid, type GridItem } from "@/components/dashboard/grid";
import { widgetComponents } from "@/components/dashboard/widgets";
import {
  listDashboards,
  getDashboard,
  saveDashboard,
  deleteDashboard,
  getDashboardSummary,
  type DashboardConfig,
  type DashboardWidget,
  widgetMeta,
  type DashboardSummary,
} from "@/lib/dashboards.functions";
import { useAuth } from "@/lib/auth-context";
import { useFxRates } from "@/lib/fx";
import { cn } from "@/lib/utils";

const TEMPLATES: { name: string; widgets: DashboardWidget[] }[] = [
  {
    name: "CEO",
    widgets: [
      { id: "revenue", type: "revenue", w: 3, h: 2, x: 0, y: 0 },
      { id: "profit", type: "profit", w: 3, h: 2, x: 3, y: 0 },
      { id: "ftd", type: "ftd", w: 3, h: 2, x: 6, y: 0 },
      { id: "withdrawals", type: "withdrawals", w: 3, h: 2, x: 9, y: 0 },
      { id: "cash", type: "cash", w: 6, h: 3, x: 0, y: 2 },
      { id: "forecast", type: "forecast", w: 6, h: 3, x: 6, y: 2 },
      { id: "clients", type: "clients", w: 4, h: 3, x: 0, y: 5 },
      { id: "sources", type: "sources", w: 4, h: 3, x: 4, y: 5 },
      { id: "employees", type: "employees", w: 4, h: 3, x: 8, y: 5 },
    ],
  },
  {
    name: "Finance",
    widgets: [
      { id: "revenue", type: "revenue", w: 4, h: 2, x: 0, y: 0 },
      { id: "expenses", type: "expenses", w: 4, h: 2, x: 4, y: 0 },
      { id: "withdrawals", type: "withdrawals", w: 4, h: 2, x: 8, y: 0 },
      { id: "profit", type: "profit", w: 4, h: 2, x: 0, y: 2 },
      { id: "cash", type: "cash", w: 8, h: 4, x: 4, y: 2 },
      { id: "affiliates", type: "affiliates", w: 4, h: 2, x: 0, y: 4 },
      { id: "tasks", type: "tasks", w: 4, h: 2, x: 4, y: 6 },
    ],
  },
  {
    name: "Sales Manager",
    widgets: [
      { id: "ftd", type: "ftd", w: 3, h: 2, x: 0, y: 0 },
      { id: "std", type: "std", w: 3, h: 2, x: 3, y: 0 },
      { id: "clients", type: "clients", w: 3, h: 3, x: 6, y: 0 },
      { id: "sources", type: "sources", w: 3, h: 3, x: 9, y: 0 },
      { id: "employees", type: "employees", w: 6, h: 3, x: 0, y: 2 },
      { id: "tasks", type: "tasks", w: 3, h: 2, x: 6, y: 3 },
    ],
  },
];

const WIDGET_KEYS = Object.keys(widgetMeta) as (keyof typeof widgetMeta)[];

export const Route = createFileRoute("/_authenticated/dashboards")({
  head: () => ({
    title: "Dashboards — Ledgerly",
    meta: [
      { name: "description", content: "Build and save custom dashboards for your Ledgerly workspace." },
      { property: "og:title", content: "Dashboards — Ledgerly" },
      { property: "og:description", content: "Build and save custom dashboards for your Ledgerly workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardsPage,
});

function DashboardsPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { loading: fxLoading } = useFxRates();

  const fetchList = useServerFn(listDashboards);
  const fetchDetail = useServerFn(getDashboard);
  const saveFn = useServerFn(saveDashboard);
  const deleteFn = useServerFn(deleteDashboard);
  const fetchSummary = useServerFn(getDashboardSummary);

  const [selectedId, setSelectedId] = useState<string>("");
  const [editing, setEditing] = useState<DashboardConfig | null>(null);
  const [newName, setNewName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [template, setTemplate] = useState<string>("");

  const { data: dashboards, isLoading } = useQuery({
    queryKey: ["dashboards"],
    queryFn: () => fetchList(),
  });

  const selected = useMemo(() => dashboards?.find((d) => d.id === selectedId), [dashboards, selectedId]);

  const { data: dashboardRow, isLoading: detailLoading } = useQuery({
    queryKey: ["dashboard", selectedId],
    queryFn: () => fetchDetail({ data: { id: selectedId } }),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (dashboardRow?.config && !editing) {
      setEditing(dashboardRow.config as DashboardConfig);
    }
  }, [dashboardRow, editing]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboard-summary", selectedId || "default"],
    queryFn: () => fetchSummary(),
    enabled: !!selectedId && !fxLoading,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; name: string; config: DashboardConfig; is_default?: boolean }) =>
      saveFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      qc.invalidateQueries({ queryKey: ["dashboard", selectedId] });
      toast.success("Dashboard saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (payload: { id: string }) => deleteFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      setSelectedId("");
      setEditing(null);
      toast.success("Dashboard deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const config = editing;
  const canEdit = isAdmin || (selected ? selected.user_id === user?.id : true);

  const gridItems: GridItem[] = useMemo(() => {
    if (!config) return [];
    return config.widgets.map((w) => ({
      i: w.id,
      x: w.x ?? 0,
      y: w.y ?? 0,
      w: w.w ?? widgetMeta[w.type]?.w ?? 3,
      h: w.h ?? widgetMeta[w.type]?.h ?? 2,
    }));
  }, [config]);

  const addWidget = useCallback(
    (type: keyof typeof widgetMeta) => {
      const meta = widgetMeta[type];
      const widgets: DashboardWidget[] = config ? [...config.widgets] : [];
      const maxY = widgets.reduce((m, w) => Math.max(m, (w.y ?? 0) + (w.h ?? meta.h)), 0);
      const id = `${type}-${Date.now()}`;
      widgets.push({ id, type, x: 0, y: maxY, w: meta.w, h: meta.h });
      setEditing({ ...(config ?? { widgets: [] }), widgets });
    },
    [config],
  );

  const removeWidget = useCallback(
    (id: string) => {
      if (!config) return;
      const widgets = config.widgets.filter((w) => w.id !== id);
      setEditing({ ...config, widgets });
    },
    [config],
  );

  const onLayoutChange = useCallback(
    (items: GridItem[]) => {
      if (!config) return;
      const map = new Map(items.map((i) => [i.i, i]));
      const widgets = config.widgets.map((w) => {
        const l = map.get(w.id);
        return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
      });
      setEditing({ ...config, widgets });
    },
    [config],
  );

  const save = useCallback(() => {
    if (!editing || !selected) return;
    saveMutation.mutate({
      id: selected.id,
      name: selected.name,
      config: editing,
    });
  }, [editing, saveMutation, selected]);

  const createFromTemplate = useCallback(() => {
    const t = TEMPLATES.find((x) => x.name === template);
    if (!t) return;
    saveMutation.mutate(
      { name: newName || `${template} dashboard`, config: { widgets: t.widgets } },
      {
        onSuccess: (row) => {
          setSelectedId(row.id);
          setIsCreateOpen(false);
          setNewName("");
        },
      },
    );
  }, [newName, saveMutation, template]);

  const duplicate = useCallback(() => {
    if (!selected || !dashboardRow?.config) return;
    saveMutation.mutate(
      { name: `${selected.name} copy`, config: dashboardRow.config as DashboardConfig },
      {
        onSuccess: (row) => {
          setSelectedId(row.id);
          toast.success("Dashboard duplicated");
        },
      },
    );
  }, [saveMutation, selected, dashboardRow]);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading dashboards…</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboards</h1>
            <p className="text-sm text-muted-foreground">Build custom layouts and save views for your team.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedId}
              onValueChange={(v) => {
                setSelectedId(v);
                setEditing(null);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select dashboard" />
              </SelectTrigger>
              <SelectContent>
                {(dashboards ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.is_default && " (default)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="mr-1 h-4 w-4" /> New
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create dashboard</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Weekly Review" />
                  </div>
                  <div className="space-y-2">
                    <Label>Start from template</Label>
                    <Select value={template} onValueChange={setTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose template" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATES.map((t) => (
                          <SelectItem key={t.name} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createFromTemplate} disabled={!template || saveMutation.isPending} className="w-full">
                    <LayoutTemplate className="mr-2 h-4 w-4" /> Create
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {selected && (
              <>
                <Button variant="outline" size="sm" onClick={duplicate} disabled={saveMutation.isPending || deleteMutation.isPending || detailLoading}>
                  <Copy className="mr-1 h-4 w-4" /> Duplicate
                </Button>
                {editing && canEdit && (
                  <Button size="sm" onClick={save} disabled={saveMutation.isPending}>
                    <Save className="mr-1 h-4 w-4" /> Save
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this dashboard?")) deleteMutation.mutate({ id: selected.id });
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {!selectedId || dashboards?.length === 0 ? (
          <div className="card-surface flex flex-col items-center justify-center py-20 text-center">
            <LayoutGrid className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h2 className="font-display text-lg font-medium">No dashboard selected</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create a dashboard from a template to get started, or pick one from the selector above.
            </p>
          </div>
        ) : detailLoading || summaryLoading || !summary ? (
          <div className="card-surface flex h-64 items-center justify-center text-muted-foreground">Loading dashboard data…</div>
        ) : (
          <div className="space-y-4">
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="mr-1 h-4 w-4" /> Add widget
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    {WIDGET_KEYS.map((key) => (
                      <DropdownMenuItem key={key} onClick={() => addWidget(key)}>
                        {widgetMeta[key].title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {editing && <span className="ml-2 text-xs text-muted-foreground">Drag the handle to move, resize from the corner.</span>}
              </div>
            )}

            <DashboardGrid items={gridItems} onChange={canEdit ? onLayoutChange : undefined}>
              {(config?.widgets ?? []).map((w) => (
                <div key={w.id} data-grid={{ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h }} className="relative group">
                  <div
                    className={cn(
                      "absolute left-0 top-0 z-10 hidden items-center gap-1 rounded-br-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground group-hover:flex",
                      !canEdit && "hidden",
                    )}
                  >
                    <GripVertical className="drag-handle h-3 w-3 cursor-move" />
                    <span className="drag-handle cursor-move">{widgetMeta[w.type].label}</span>
                    <button
                      type="button"
                      onClick={() => removeWidget(w.id)}
                      className="ml-2 rounded p-0.5 hover:bg-primary-foreground/20"
                      aria-label="Remove widget"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <WidgetRenderer type={w.type} title={w.title} summary={summary} />
                </div>
              ))}
            </DashboardGrid>
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetRenderer({ type, title, summary }: { type: keyof typeof widgetMeta; title?: string; summary: DashboardSummary }) {
  const Component = widgetComponents[type];
  if (!Component) return <div className="card-surface flex h-full items-center justify-center text-sm text-muted-foreground">Unknown widget</div>;
  return <Component data={summary} title={title} />;
}
