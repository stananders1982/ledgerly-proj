import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ACTION_PERMISSIONS, ROLES_QUERY_KEY, ROLE_PERMISSIONS_KEY, useRoles } from "@/lib/permissions";
import { defaultNavAllowed } from "@/lib/permission-admin";
import { navKeysForReset } from "@/components/permission-matrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { roles } = useRoles();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-[150px]">
        <SelectValue placeholder="Role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.key} value={r.key}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RolesAdmin() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const { roles, custom } = useRoles();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [actions, setActions] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No workspace selected");
      if (!name.trim()) throw new Error("Give the role a name");
      const { data, error } = await supabase
        .from("custom_roles")
        .insert({ company_id: companyId, name: name.trim() })
        .select("id")
        .single();
      if (error) throw error;
      const roleKey = `custom:${data.id}`;
      const rows = [
        ...navKeysForReset().map((n) => ({
          company_id: companyId,
          role_key: roleKey,
          nav_key: n,
          action_key: null,
          allowed: defaultNavAllowed("agent", n),
        })),
        ...ACTION_PERMISSIONS.map((a) => ({
          company_id: companyId,
          role_key: roleKey,
          nav_key: null,
          action_key: a.key,
          allowed: actions.includes(a.key),
        })),
      ];
      const { error: permErr } = await supabase.from("role_permissions").insert(rows);
      if (permErr) throw permErr;
    },
    onSuccess: () => {
      toast.success("Custom role created");
      setCreating(false);
      setName("");
      setActions([]);
      qc.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ROLE_PERMISSIONS_KEY });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create role"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_roles").delete().eq("id", id);
      if (error) throw error;
      await supabase.from("role_permissions").delete().eq("role_key", `custom:${id}`);
    },
    onSuccess: () => {
      toast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ROLE_PERMISSIONS_KEY });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not delete role"),
  });

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Shield className="h-4 w-4" /> Roles
          </h2>
          <p className="text-xs text-muted-foreground">
            Built-in roles cannot be deleted, but their access is fully editable in the matrices above.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New role
        </Button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{r.label}</span>
              <Badge variant={r.builtin ? "secondary" : "outline"} className="text-[10px]">
                {r.builtin ? "Built-in" : "Custom"}
              </Badge>
            </div>
            {!r.builtin && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove.mutate(r.key.replace("custom:", ""))}
                aria-label={`Delete ${r.label}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        {custom.length === 0 && (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground sm:col-span-2">
            No custom roles yet — create one to group a specific set of permissions.
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New custom role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label className="text-xs">Role name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team lead" />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Actions this role can perform</Label>
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border p-3">
                {ACTION_PERMISSIONS.map((a) => (
                  <label key={a.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={actions.includes(a.key)}
                      onCheckedChange={(v) =>
                        setActions(v ? [...actions, a.key] : actions.filter((x) => x !== a.key))
                      }
                    />
                    {a.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Page access starts from the Agent defaults — fine-tune it in the Page Access tab afterwards.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
