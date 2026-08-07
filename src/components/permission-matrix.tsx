import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { NAV_ITEMS } from "@/lib/nav-items";
import { ACTION_PERMISSIONS, LOCKED_NAV_KEYS, ROLE_PERMISSIONS_KEY, useRoles, type RoleOption } from "@/lib/permissions";
import {
  defaultActionAllowed,
  defaultNavAllowed,
  fetchRolePermissions,
  permMatches,
  resetRoleDefaults,
  setRolePermission,
  type MatrixRow,
} from "@/lib/permission-admin";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type MatrixKind = "nav" | "action";

type RowDef = { key: string; label: string; hint?: string; locked?: boolean };

export function useMatrixRows(kind: MatrixKind): RowDef[] {
  return useMemo(() => {
    if (kind === "action") {
      return ACTION_PERMISSIONS.map((a) => ({ key: a.key, label: a.label, hint: a.hint }));
    }
    return NAV_ITEMS.filter((i) => !i.superAdminOnly).map((i) => ({
      key: i.key,
      label: i.title,
      hint: i.url,
      locked: LOCKED_NAV_KEYS.includes(i.key),
    }));
  }, [kind]);
}

export function navKeysForReset() {
  return NAV_ITEMS.filter((i) => !i.superAdminOnly).map((i) => i.key);
}

export function PermissionMatrix({ kind }: { kind: MatrixKind }) {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const { roles } = useRoles();
  const rows = useMatrixRows(kind);
  const [pending, setPending] = useState<string | null>(null);

  const permsQ = useQuery({
    enabled: !!companyId,
    queryKey: [...ROLE_PERMISSIONS_KEY, companyId],
    queryFn: fetchRolePermissions,
  });

  const value = (roleKey: string, rowKey: string) => {
    const ref = kind === "nav" ? { navKey: rowKey } : { actionKey: rowKey };
    const found = (permsQ.data ?? []).find((r: MatrixRow) => r.role_key === roleKey && permMatches(r, ref));
    if (found) return found.allowed;
    return kind === "nav" ? defaultNavAllowed(roleKey, rowKey) : defaultActionAllowed(roleKey, rowKey);
  };

  const isLocked = (role: RoleOption, _row: RowDef) => role.key === "admin";

  const toggle = useMutation({
    mutationFn: async (v: { roleKey: string; rowKey: string; allowed: boolean }) => {
      if (!companyId) throw new Error("No workspace selected");
      await setRolePermission({
        companyId,
        roleKey: v.roleKey,
        ref: kind === "nav" ? { navKey: v.rowKey } : { actionKey: v.rowKey },
        allowed: v.allowed,
      });
      return v;
    },
    onMutate: (v) => setPending(`${v.roleKey}:${v.rowKey}`),
    onSettled: () => setPending(null),
    onSuccess: (v) => {
      const role = roles.find((r) => r.key === v.roleKey)?.label ?? v.roleKey;
      const row = rows.find((r) => r.key === v.rowKey)?.label ?? v.rowKey;
      toast.success(`${role}: ${row} ${v.allowed ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: ROLE_PERMISSIONS_KEY });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update permission"),
  });

  const reset = useMutation({
    mutationFn: async (roleKey: string) => {
      if (!companyId) throw new Error("No workspace selected");
      await resetRoleDefaults({
        companyId,
        roleKey,
        navKeys: navKeysForReset(),
        actionKeys: ACTION_PERMISSIONS.map((a) => a.key),
      });
      return roleKey;
    },
    onSuccess: (roleKey) => {
      toast.success(`${roles.find((r) => r.key === roleKey)?.label ?? roleKey} reset to defaults`);
      qc.invalidateQueries({ queryKey: ROLE_PERMISSIONS_KEY });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not reset role"),
  });

  if (permsQ.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Desktop matrix */}
      <div className="hidden md:block max-h-[70vh] overflow-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="border-b">
              <th className="sticky left-0 z-30 bg-card px-4 py-3 text-left font-medium min-w-[220px]">
                {kind === "nav" ? "Page" : "Action"}
              </th>
              {roles.map((role) => (
                <th key={role.key} className="px-4 py-2 text-center font-medium">
                  <div>{role.label}</div>
                  {role.key === "admin" ? (
                    <div className="text-[10px] font-normal text-muted-foreground">always full access</div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] font-normal text-muted-foreground"
                      disabled={reset.isPending}
                      onClick={() => reset.mutate(role.key)}
                    >
                      <RotateCcw className="h-3 w-3" /> Reset
                    </Button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`border-b last:border-0 ${row.locked ? "bg-muted/40" : ""}`}>
                <th className={`sticky left-0 z-10 px-4 py-2.5 text-left font-normal ${row.locked ? "bg-muted/60" : "bg-card"}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={row.locked ? "text-muted-foreground" : ""}>{row.label}</span>
                    </TooltipTrigger>
                    {row.hint && <TooltipContent>{row.hint}</TooltipContent>}
                  </Tooltip>
                </th>
                {roles.map((role) => {
                  const locked = isLocked(role, row);
                  return (
                    <td key={role.key} className="px-4 py-2.5 text-center">
                      <Switch
                        checked={locked ? true : value(role.key, row.key)}
                        disabled={locked || pending === `${role.key}:${row.key}`}
                        onCheckedChange={(v) => toggle.mutate({ roleKey: role.key, rowKey: row.key, allowed: v })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one role at a time */}
      <Accordion type="single" collapsible className="md:hidden rounded-xl border px-3">
        {roles.map((role) => (
          <AccordionItem key={role.key} value={role.key}>
            <AccordionTrigger className="text-sm">{role.label}</AccordionTrigger>
            <AccordionContent>
              {role.key !== "admin" && (
                <Button size="sm" variant="outline" className="mb-3" onClick={() => reset.mutate(role.key)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
                </Button>
              )}
              <div className="space-y-2">
                {rows.map((row) => {
                  const locked = isLocked(role, row);
                  return (
                    <div key={row.key} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
                      <span className={`text-sm ${row.locked ? "text-muted-foreground" : ""}`}>{row.label}</span>
                      <Switch
                        checked={locked ? true : value(role.key, row.key)}
                        disabled={locked}
                        onCheckedChange={(v) => toggle.mutate({ roleKey: role.key, rowKey: row.key, allowed: v })}
                      />
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}
