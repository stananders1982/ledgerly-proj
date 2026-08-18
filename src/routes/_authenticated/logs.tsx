import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bug, Info, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { DataCardList, DataCard } from "@/components/data-card-list";
import { TablePagination, usePagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [
      { title: "System Logs — Ledgerly" },
      { name: "description", content: "Monitor application errors, warnings and security events across your company." },
      { property: "og:title", content: "System Logs — Ledgerly" },
      { property: "og:description", content: "Monitor application errors, warnings and security events across your company." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LogsPage,
});

const LEVELS = ["all", "info", "warning", "error", "security"] as const;

function LevelBadge({ level }: { level: string }) {
  const map: Record<string, { cls: string; icon: typeof Info }> = {
    info: { cls: "bg-muted text-muted-foreground", icon: Info },
    warning: { cls: "bg-yellow-500/15 text-yellow-500", icon: AlertTriangle },
    error: { cls: "bg-destructive/15 text-destructive", icon: Bug },
    security: { cls: "bg-primary/15 text-primary", icon: ShieldAlert },
  };
  const { cls, icon: Icon } = map[level] ?? map.info;
  return (
    <Badge variant="outline" className={`gap-1 border-transparent ${cls}`}>
      <Icon className="h-3 w-3" /> {level}
    </Badge>
  );
}

function LogsPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["app-logs"],
    enabled: isAdmin || isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? []).filter((r: any) => {
      if (level !== "all" && r.level !== level) return false;
      if (!term) return true;
      return [r.message, r.source, r.user_email, r.path].some((v) => (v ?? "").toLowerCase().includes(term));
    });
  }, [q.data, level, search]);

  const counts = useMemo(() => {
    const all = q.data ?? [];
    return {
      total: all.length,
      errors: all.filter((r: any) => r.level === "error").length,
      warnings: all.filter((r: any) => r.level === "warning").length,
      security: all.filter((r: any) => r.level === "security").length,
    };
  }, [q.data]);

  const pg = usePagination(rows, 25, "logs");
  const pageItems = pg.pageItems;

  if (!isAdmin && !isSuperAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Admins only"
        description="You don't have permission to view system logs."
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Monitoring"
        title="System logs"
        description="Application errors, warnings and security events from across the app."
        actions={
          <Button variant="outline" size="sm" onClick={() => q.refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search message, user, path…" />
            <Select value={level} onValueChange={(v) => setLevel(v as any)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l === "all" ? "All levels" : l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Events" value={String(counts.total)} />
        <StatCard label="Errors" value={String(counts.errors)} />
        <StatCard label="Warnings" value={String(counts.warnings)} />
        <StatCard label="Security" value={String(counts.security)} />
      </div>

      <div className="card-surface overflow-hidden">
        {q.isLoading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={Info} title="No logs yet" description="Events will appear here as they are recorded." />
        ) : (
          <>
            <DataCardList>
              {pageItems.map((r: any) => (
                <DataCard
                  key={r.id}
                  title={r.message}
                  subtitle={new Date(r.created_at).toLocaleString()}
                  fields={[
                    { label: "Level", value: <LevelBadge level={r.level} /> },
                    { label: "Source", value: r.source },
                    { label: "User", value: r.user_email ?? "—" },
                    { label: "Path", value: r.path ?? "—" },
                  ]}
                />
              ))}
            </DataCardList>
            <div className="hidden md:block overflow-x-auto scroll-slim">
              <table className="w-full text-sm">
                <thead className="table-head bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4 font-medium">Time</th>
                    <th className="py-3 px-4 font-medium">Level</th>
                    <th className="py-3 px-4 font-medium">Source</th>
                    <th className="py-3 px-4 font-medium">Message</th>
                    <th className="py-3 px-4 font-medium">User</th>
                    <th className="py-3 px-4 font-medium">Path</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50 align-top transition-colors hover:bg-accent/30">
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4"><LevelBadge level={r.level} /></td>
                      <td className="py-3 px-4">{r.source}</td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-medium">{r.message}</div>
                        {r.details && (
                          <pre className="mt-1 max-h-24 overflow-auto scroll-slim rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                            {JSON.stringify(r.details, null, 2)}
                          </pre>
                        )}
                      </td>
                      <td className="py-3 px-4">{r.user_email ?? "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground">{r.path ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination {...pg} />
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Showing the latest 500 events{q.data?.length ? ` (oldest ${fmtDate((q.data as any[])[q.data.length - 1]?.created_at)})` : ""}.
      </p>
    </div>
  );
}
