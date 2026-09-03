import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Download, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useExporters } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { TablePagination, usePagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prettyEntity, relativeTime } from "@/components/activity-feed";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Audit Log — Ledgerly" },
      { name: "description", content: "Every create, update and delete across your workspace with the user behind it." },
      { property: "og:title", content: "Audit Log — Ledgerly" },
      { property: "og:description", content: "Every create, update and delete across your workspace with the user behind it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

type Row = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  user_email: string | null;
  changes: any;
  created_at: string;
};

const ACTIONS = ["INSERT", "UPDATE", "DELETE"] as const;

function ActionBadge({ action }: { action: string }) {
  const tone =
    action === "INSERT" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : action === "DELETE" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    : "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return <Badge variant="secondary" className={tone}>{action.toLowerCase()}</Badge>;
}

function ActivityPage() {
  const { exportCSV } = useExporters();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");
  const [detail, setDetail] = useState<Row | null>(null);

  const q = useQuery({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id,action,entity_type,entity_id,entity_label,user_email,changes,created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const entities = useMemo(
    () => [...new Set((q.data ?? []).map((r) => r.entity_type))].sort(),
    [q.data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? []).filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (entity !== "all" && r.entity_type !== entity) return false;
      if (!term) return true;
      return `${r.entity_label ?? ""} ${r.user_email ?? ""} ${r.entity_type}`.toLowerCase().includes(term);
    });
  }, [q.data, search, action, entity]);

  const actCols: ColDef<any>[] = [
    { key: "when", label: "When", filter: "date", value: (r) => r.created_at ?? "" },
    { key: "action", label: "Action", filter: "select", value: (r) => r.action ?? "" },
    { key: "record", label: "Record", filter: "select", value: (r) => prettyEntity(r.entity_type) },
    { key: "reference", label: "Reference", value: (r) => r.entity_label ?? "" },
    { key: "user", label: "User", filter: "select", value: (r) => r.user_email ?? "system" },
  ];
  const tb = useTableToolbox<any>("activity", actCols, rows);
  const { pageItems, ...pg } = usePagination(tb.filtered, 30, "activity");

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Every create, update and delete, with the user behind it."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => q.refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                exportCSV(
                  rows.map((r) => ({
                    When: new Date(r.created_at).toLocaleString(),
                    Action: r.action,
                    Entity: r.entity_type,
                    Record: r.entity_label ?? "",
                    User: r.user_email ?? "",
                  })),
                  "audit-log",
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search record or user…" />
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIONS.map((a) => <SelectItem key={a} value={a} className="capitalize">{a.toLowerCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            {entities.map((e) => <SelectItem key={e} value={e} className="capitalize">{prettyEntity(e)}</SelectItem>)}
          </SelectContent>
        </Select>
        <ClearFiltersButton
          tb={tb}
          extraActive={(search ? 1 : 0) + (action !== "all" ? 1 : 0) + (entity !== "all" ? 1 : 0)}
          extra={() => { setSearch(""); setAction("all"); setEntity("all"); }}
        />
      </div>

      <div className="card-surface overflow-hidden">
        {q.isLoading ? (
          <TableSkeleton cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={History} title="No activity" description="Changes to income, expenses, leads and employees show up here." />
        ) : (
          <>
            <DataCardList>
              {pageItems.map((r) => (
                <DataCard
                  key={r.id}
                  title={r.entity_label || prettyEntity(r.entity_type)}
                  subtitle={relativeTime(r.created_at)}
                  onClick={() => setDetail(r)}
                  fields={[
                    { label: "Action", value: <ActionBadge action={r.action} /> },
                    { label: "Record", value: prettyEntity(r.entity_type) },
                    { label: "User", value: r.user_email ?? "system" },
                  ]}
                />
              ))}
            </DataCardList>
            <div className="hidden md:block overflow-x-auto scroll-slim">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-head border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4">When</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Record</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">User</th>
                  </tr>
                  <FilterRow tb={tb} />
                </thead>
                <tbody>
                  {pageItems.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/30"
                      onClick={() => setDetail(r)}
                    >
                      <td className="py-3 px-4 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-3 px-4"><ActionBadge action={r.action} /></td>
                      <td className="py-3 px-4 capitalize">{prettyEntity(r.entity_type)}</td>
                      <td className="py-3 px-4 font-medium">{r.entity_label || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground">{r.user_email ?? "system"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination {...pg} />
          </>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail && <ActionBadge action={detail.action} />}
              <span className="capitalize">{detail ? prettyEntity(detail.entity_type) : ""}</span>
              {detail?.entity_label ? <span className="text-muted-foreground">— {detail.entity_label}</span> : null}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">When</span><span>{detail ? new Date(detail.created_at).toLocaleString() : ""}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">User</span><span>{detail?.user_email ?? "system"}</span></div>
            <pre className="max-h-[45vh] overflow-auto scroll-slim rounded-lg border border-border bg-muted/30 p-3 text-xs">
              {JSON.stringify(detail?.changes ?? {}, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
