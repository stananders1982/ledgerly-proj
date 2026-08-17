import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ACTION_PERMISSIONS, ROLE_PERMISSIONS_KEY, USER_OVERRIDES_KEY, useRoles } from "@/lib/permissions";
import {
  clearUserOverrides,
  defaultActionAllowed,
  defaultNavAllowed,
  fetchRolePermissions,
  fetchUserOverrides,
  permMatches,
  setUserOverride,
  type PermRef,
} from "@/lib/permission-admin";
import { useMatrixRows } from "@/components/permission-matrix";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export type OverrideUser = { id: string; email: string; full_name: string | null; roleKey: string; isAdmin: boolean };

export function UserOverridesDrawer({
  user,
  onClose,
}: {
  user: OverrideUser | null;
  onClose: () => void;
}) {
  const { companyId, user: me } = useAuth();
  const qc = useQueryClient();
  const { roles } = useRoles();
  const navRows = useMatrixRows("nav");
  const actionRows = useMatrixRows("action");
  const dashboardRows = useMatrixRows("dashboard");

  const rolePermsQ = useQuery({
    enabled: !!companyId && !!user,
    queryKey: [...ROLE_PERMISSIONS_KEY, companyId],
    queryFn: fetchRolePermissions,
  });
  const overridesQ = useQuery({
    enabled: !!companyId && !!user,
    queryKey: [...USER_OVERRIDES_KEY, companyId],
    queryFn: fetchUserOverrides,
  });

  const roleValue = (ref: PermRef) => {
    if (!user) return false;
    const found = (rolePermsQ.data ?? []).find((r) => r.role_key === user.roleKey && permMatches(r, ref));
    if (found) return found.allowed;
    return ref.navKey
      ? defaultNavAllowed(user.roleKey, ref.navKey)
      : defaultActionAllowed(user.roleKey, ref.actionKey!);
  };

  const overrideValue = (ref: PermRef) => {
    if (!user) return undefined;
    const found = (overridesQ.data ?? []).find((o) => o.user_id === user.id && permMatches(o, ref));
    return found?.allowed;
  };

  const diff = useMemo(() => {
    if (!user) return { added: 0, removed: 0 };
    let added = 0;
    let removed = 0;
    for (const o of overridesQ.data ?? []) {
      if (o.user_id !== user.id) continue;
      const ref: PermRef = { navKey: o.nav_key, actionKey: o.action_key };
      const base = roleValue(ref);
      if (o.allowed && !base) added += 1;
      if (!o.allowed && base) removed += 1;
    }
    return { added, removed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overridesQ.data, rolePermsQ.data, user?.id, user?.roleKey]);

  const setOverride = useMutation({
    mutationFn: async (v: { ref: PermRef; allowed: boolean | null }) => {
      if (!companyId || !user) throw new Error("No workspace selected");
      await setUserOverride({ companyId, userId: user.id, ref: v.ref, allowed: v.allowed });
    },
    onSuccess: () => {
      toast.success("Override saved");
      qc.invalidateQueries({ queryKey: USER_OVERRIDES_KEY });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save override"),
  });

  const resetAll = useMutation({
    mutationFn: async () => {
      if (!companyId || !user) throw new Error("No workspace selected");
      await clearUserOverrides(companyId, user.id);
    },
    onSuccess: () => {
      toast.success("Overrides cleared — back to role defaults");
      qc.invalidateQueries({ queryKey: USER_OVERRIDES_KEY });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not reset overrides"),
  });

  const loading = rolePermsQ.isLoading || overridesQ.isLoading;
  const self = !!user && user.id === me?.id;
  const roleLabel = roles.find((r) => r.key === user?.roleKey)?.label ?? user?.roleKey;

  const section = (title: string, rows: { key: string; label: string }[], kind: "nav" | "action") => (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      {rows.map((row) => {
        const ref: PermRef = kind === "nav" ? { navKey: row.key } : { actionKey: row.key };
        const base = roleValue(ref);
        const ov = overrideValue(ref);
        const effective = ov ?? base;
        return (
          <div key={row.key} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm">{row.label}</div>
              <div className="text-[11px] text-muted-foreground">
                Role default: {base ? "allowed" : "denied"}
                {ov !== undefined && <span className="ml-1 text-primary">· overridden</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {ov !== undefined && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  disabled={self}
                  onClick={() => setOverride.mutate({ ref, allowed: null })}
                >
                  Clear
                </Button>
              )}
              <Switch
                checked={effective}
                disabled={self || setOverride.isPending}
                onCheckedChange={(v) => setOverride.mutate({ ref, allowed: v === base ? null : v })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{user?.full_name || user?.email}</SheetTitle>
          <SheetDescription>
            Role <Badge variant="secondary">{roleLabel}</Badge> — toggles below override the role defaults for this
            person only.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          {self && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              You cannot change your own permissions.
            </div>
          )}
          {user?.isAdmin && (
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              This user is an admin and always has full access; overrides have no effect.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div className="text-sm">
              <span className="font-medium text-emerald-600">{diff.added}</span> added,{" "}
              <span className="font-medium text-destructive">{diff.removed}</span> removed vs role default
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={self || resetAll.isPending || diff.added + diff.removed === 0}
              onClick={() => resetAll.mutate()}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to role defaults
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              {section("Page access", navRows, "nav")}
              {section("Action permissions", actionRows, "action")}
              {section("Dashboard sections", dashboardRows, "nav")}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Members of the current workspace with their assigned role. */
export function useWorkspaceMembers() {
  const { companyId } = useAuth();
  return useQuery({
    enabled: !!companyId,
    queryKey: ["workspace-members", companyId],
    queryFn: async () => {
      const [{ data: members, error }, { data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("company_users").select("user_id, role_key").eq("company_id", companyId!),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return (members ?? []).map((m) => ({
        id: m.user_id,
        email: profiles?.find((p) => p.id === m.user_id)?.full_name ?? m.user_id.slice(0, 8),
        full_name: profiles?.find((p) => p.id === m.user_id)?.full_name ?? null,
        roleKey: (m as any).role_key ?? "agent",
        isAdmin: !!roles?.some((r) => r.user_id === m.user_id && r.role === "admin"),
      })) as OverrideUser[];
    },
  });
}
