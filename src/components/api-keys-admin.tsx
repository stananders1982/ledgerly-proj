import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, KeyRound, Plus, ShieldAlert, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const API_PERMISSIONS = [
  { key: "read_leads", label: "Read leads & clients" },
  { key: "write_leads", label: "Create lead entries" },
  { key: "write_deposits", label: "Create deposits" },
  { key: "read_reports", label: "Read P&L summary" },
] as const;

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  affiliate_id: string | null;
};


async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const body = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ldg_${body}`;
}

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export function ApiKeysAdmin() {
  const { companyId, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", permissions: ["read_leads"] as string[], expires_at: "" });

  const keysQ = useQuery({
    queryKey: ["api-keys", companyId],
    enabled: !!companyId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, permissions, created_at, last_used_at, expires_at, revoked_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKeyRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Give the key a name");
      if (!form.permissions.length) throw new Error("Pick at least one permission");
      const raw = generateKey();
      const { error } = await supabase.from("api_keys").insert({
        company_id: companyId!,
        name: form.name.trim(),
        key_hash: await sha256Hex(raw),
        key_prefix: raw.slice(0, 12),
        permissions: form.permissions,
        created_by: user?.id ?? null,
        expires_at: form.expires_at ? new Date(`${form.expires_at}T23:59:59`).toISOString() : null,
      });
      if (error) throw error;
      return raw;
    },
    onSuccess: (raw) => {
      setCreating(false);
      setNewKey(raw);
      setForm({ name: "", permissions: ["read_leads"], expires_at: "" });
      qc.invalidateQueries({ queryKey: ["api-keys", companyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create key"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRevokeTarget(null);
      toast.success("API key revoked");
      qc.invalidateQueries({ queryKey: ["api-keys", companyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not revoke key"),
  });

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  if (!isAdmin) return null;
  const rows = keysQ.data ?? [];

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4" /> API keys
          </h2>
          <p className="text-xs text-muted-foreground">
            Let external systems push leads and deposits into this workspace over HTTPS.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/api-docs">
              <BookOpen className="h-4 w-4" /> API docs
            </Link>
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New key
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  {keysQ.isLoading ? "Loading…" : "No API keys yet."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((k) => {
              const expired = !!k.expires_at && new Date(k.expires_at).getTime() < Date.now();
              return (
                <TableRow key={k.id}>
                  <TableCell>
                    <div className="font-medium">{k.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{k.key_prefix}…</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {k.permissions.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(k.last_used_at)}</TableCell>
                  <TableCell className="text-sm">{k.expires_at ? fmtDate(k.expires_at) : "Never"}</TableCell>
                  <TableCell className="text-right">
                    {k.revoked_at ? (
                      <Badge variant="outline">Revoked</Badge>
                    ) : expired ? (
                      <Badge variant="outline">Expired</Badge>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                        <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(k)}>
                          Revoke
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="CRM integration"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Permissions</Label>
              {API_PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.permissions.includes(p.key)}
                    onCheckedChange={(v) =>
                      setForm({
                        ...form,
                        permissions: v
                          ? [...form.permissions, p.key]
                          : form.permissions.filter((x) => x !== p.key),
                      })
                    }
                  />
                  <span>{p.label}</span>
                  <code className="text-[11px] text-muted-foreground">{p.key}</code>
                </label>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Expiry (optional)</Label>
              <Input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal-once dialog */}
      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>Save this now — you won't see it again.</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-muted p-3 font-mono text-xs">{newKey}</code>
            <Button size="icon" variant="outline" onClick={() => newKey && copy(newKey)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revokeTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Any system using this key will immediately stop working. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => revokeTarget && revoke.mutate(revokeTarget.id)}>
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
