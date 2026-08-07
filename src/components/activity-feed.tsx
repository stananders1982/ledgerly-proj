import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export type ActivityRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  user_email: string | null;
  created_at: string;
};

const actionTone: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  UPDATE: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  DELETE: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const actionVerb: Record<string, string> = {
  INSERT: "created",
  UPDATE: "updated",
  DELETE: "deleted",
};

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function prettyEntity(entity: string) {
  return entity.replace(/_/g, " ").replace(/^daily lead /, "");
}

/** Recent business activity across the workspace. */
export function ActivityFeed({
  limit = 10,
  sinceIso,
  untilIso,
}: { limit?: number; sinceIso?: string; untilIso?: string }) {
  const q = useQuery({
    queryKey: ["activity-feed", limit, sinceIso, untilIso],
    queryFn: async () => {
      let query = supabase
        .from("activity_log")
        .select("id,action,entity_type,entity_label,user_email,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      // Scope to the dashboard period when one is supplied.
      if (sinceIso) query = query.gte("created_at", `${sinceIso}T00:00:00`);
      if (untilIso) query = query.lte("created_at", `${untilIso}T23:59:59.999`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="glass-surface glass-hover p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" /> Recent activity
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Who changed what, across the workspace</p>
        </div>
        <Link to="/activity" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          View all
        </Link>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {(q.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
              <Badge className={actionTone[a.action] ?? ""} variant="secondary">
                {actionVerb[a.action] ?? a.action.toLowerCase()}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  <span className="capitalize">{prettyEntity(a.entity_type)}</span>
                  {a.entity_label ? <span className="text-muted-foreground"> — {a.entity_label}</span> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">{a.user_email ?? "system"}</div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
