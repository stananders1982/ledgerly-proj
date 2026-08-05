/**
 * Grant or revoke action-level permissions per user.
 * Page access is handled separately in User Management; this controls what a
 * user may *do* on the pages they can already reach.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ACTION_PERMISSIONS, type ActionKey } from "@/lib/permissions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";

export function ActionPermissionsAdmin({ userId: propUserId }: { userId?: string } = {}) {
  const { isAdmin, companyId } = useAuth();
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>(propUserId ?? "");
  const userId = propUserId ?? selectedUserId;

  useEffect(() => {
    if (propUserId) setSelectedUserId(propUserId);
  }, [propUserId]);

  const usersQ = useQuery({
    enabled: isAdmin && !propUserId,
    queryKey: ["action-perms-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const permsQ = useQuery({
    enabled: isAdmin && !!userId,
    queryKey: ["action-perms", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_permissions")
        .select("action_key,allowed")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as { action_key: string; allowed: boolean }[];
    },
  });

  const setPerm = useMutation({
    mutationFn: async ({ key, allowed }: { key: ActionKey; allowed: boolean }) => {
      if (!companyId) throw new Error("No company selected");
      const { error } = await supabase
        .from("action_permissions")
        .upsert(
          { user_id: userId, company_id: companyId, action_key: key, allowed },
          { onConflict: "user_id,action_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-perms", userId] });
      qc.invalidateQueries({ queryKey: ["action-permissions"] });
      toast.success("Permission updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  const allowed = new Set((permsQ.data ?? []).filter((p) => p.allowed).map((p) => p.action_key));

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Action permissions
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fine-grained control over what this user can do. Admins always have every permission.
        </p>
      </div>

      {!propUserId && (
        <div className="grid max-w-sm gap-1.5">
          <Label className="text-xs">User</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
            <SelectContent>
              {(usersQ.data ?? []).map((u: any) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name || "Unnamed user"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {userId && (
        <div className="grid gap-3">
          {ACTION_PERMISSIONS.map((a) => (
            <div key={a.key} className="flex items-start gap-3">
              <Switch
                id={`perm-${a.key}`}
                checked={allowed.has(a.key)}
                onCheckedChange={(v) => setPerm.mutate({ key: a.key, allowed: v })}
              />
              <div className="grid gap-0.5">
                <Label htmlFor={`perm-${a.key}`} className="text-sm">{a.label}</Label>
                <p className="text-xs text-muted-foreground">{a.hint}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
