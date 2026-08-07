import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, KeyRound, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useSort } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";
import { ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ActionPermissionsAdmin } from "@/components/action-permissions-admin";
import { useAuth } from "@/lib/auth-context";
import { NAV_ITEMS, MANAGEABLE_NAV_KEYS } from "@/lib/nav-items";
import {
  listAppUsers,
  createAppUser,
  updateUserPermissions,
  resetUserPassword,
  deleteAppUser,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/users/")({
  head: () => ({ meta: [{ title: "Users — Ledgerly" }] }),
  component: UsersPage,
});

type AppUser = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  roles: string[];
  nav_keys: string[];
  is_super_admin?: boolean;
};

function UsersPage() {
  const { isAdmin, isSuperAdmin, permsLoaded, user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [resetting, setResetting] = useState<AppUser | null>(null);

  const list = useServerFn(listAppUsers);
  const create = useServerFn(createAppUser);
  const update = useServerFn(updateUserPermissions);
  const reset = useServerFn(resetUserPassword);
  const remove = useServerFn(deleteAppUser);

  const q = useQuery({
    queryKey: ["app-users"],
    queryFn: () => list(),
    enabled: isAdmin && permsLoaded,
  });

  const createMut = useMutation({
    mutationFn: (v: { email: string; password: string; full_name: string; is_admin: boolean; nav_keys: string[] }) =>
      create({ data: v }),
    onSuccess: () => {
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["app-users"] });
      setCreateOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create user"),
  });

  const updateMut = useMutation({
    mutationFn: (v: { user_id: string; is_admin: boolean; nav_keys: string[] }) => update({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["app-users"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const resetMut = useMutation({
    mutationFn: (v: { user_id: string; password: string }) => reset({ data: v }),
    onSuccess: () => {
      toast.success("Password reset");
      setResetting(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Reset failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (user_id: string) => remove({ data: { user_id } }),
    onSuccess: () => {
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  if (permsLoaded && !isAdmin) return <Navigate to="/" />;

  const rows = (q.data ?? []) as AppUser[];
  const { sorted, sort, toggle } = useSort<AppUser>(rows, {
    name: (u: any) => u.name ?? "",
    email: (u: any) => u.email ?? "",
    role: (u: any) => (u.roles.includes("admin") ? "admin" : "user"),
    pages: (u: any) => (u.nav_permissions?.length ?? 0),
  });
  const { pageItems, ...pg } = usePagination(sorted, 30);
  const th = (label: string, k: string) => (
    <button type="button" onClick={() => toggle(k)} className="inline-flex items-center gap-1 hover:text-foreground">
      {label} <ArrowUpDown className={`h-3 w-3 ${sort?.key === k ? "opacity-100" : "opacity-40"}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Create users and choose which pages they can see."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add user</Button>
            </DialogTrigger>
            <CreateUserDialog onSubmit={(v) => createMut.mutate(v)} pending={createMut.isPending} />
          </Dialog>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{th("Name", "name")}</TableHead>
              <TableHead>{th("Email", "email")}</TableHead>
              <TableHead>{th("Role", "role")}</TableHead>
              <TableHead>{th("Pages", "pages")}</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!q.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users yet.</TableCell></TableRow>
            )}
            {pageItems.map((u) => {
              const adm = u.roles.includes("admin");
              const locked = !!u.is_super_admin && !isSuperAdmin && u.id !== user?.id;
              return (
                <TableRow
                  key={u.id}
                  className={locked ? undefined : "cursor-pointer"}
                  onClick={locked ? undefined : () => setEditing(u)}
                >
                  <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {u.is_super_admin ? (
                      <Badge className="gap-1"><ShieldCheck className="h-3 w-3" /> Owner</Badge>
                    ) : adm ? (
                      <Badge className="gap-1"><ShieldCheck className="h-3 w-3" /> Admin</Badge>
                    ) : (
                      <Badge variant="secondary">User</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {adm ? (
                      <span className="text-xs text-muted-foreground">All pages</span>
                    ) : u.nav_keys.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No access</span>
                    ) : (
                      <span className="text-xs">{u.nav_keys.length} page{u.nav_keys.length === 1 ? "" : "s"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                    {locked ? (
                      <span className="text-xs text-muted-foreground">Managed by platform owner</span>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditing(u)}>Edit access</Button>
                        <Button size="sm" variant="ghost" onClick={() => setResetting(u)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {u.id !== user?.id && !locked && !u.is_super_admin && (
                      <ConfirmDelete
                        label={`Delete ${u.email}?`}
                        description="This permanently removes the user account."
                        onConfirm={() => deleteMut.mutate(u.id)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination {...pg} />
      </div>

      {editing && (
        <EditAccessDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSubmit={(v) => updateMut.mutate({ user_id: editing.id, ...v })}
          pending={updateMut.isPending}
        />
      )}

      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onSubmit={(password) => resetMut.mutate({ user_id: resetting.id, password })}
          pending={resetMut.isPending}
        />
      )}
    </div>
  );
}

function CreateUserDialog({
  onSubmit,
  pending,
}: {
  onSubmit: (v: { email: string; password: string; full_name: string; is_admin: boolean; nav_keys: string[] }) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [keys, setKeys] = useState<Set<string>>(new Set(MANAGEABLE_NAV_KEYS));

  function toggle(k: string) {
    const next = new Set(keys);
    if (next.has(k)) next.delete(k); else next.add(k);
    setKeys(next);
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Temporary password</Label>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
          <p className="text-xs text-muted-foreground">Share this with the user; they can change it after signing in.</p>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Admin</div>
            <div className="text-xs text-muted-foreground">Admins have access to everything, including this page.</div>
          </div>
          <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
        </div>
        {!isAdmin && (
          <div className="space-y-2">
            <Label>Pages this user can access</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
              {NAV_ITEMS.filter((i) => !i.adminOnly).map((i) => (
                <label key={i.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={keys.has(i.key)} onCheckedChange={() => toggle(i.key)} />
                  <i.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {i.title}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({ email, password, full_name: fullName, is_admin: isAdmin, nav_keys: isAdmin ? [] : Array.from(keys) })
          }
          disabled={pending || !email || !password || !fullName}
        >
          {pending ? "Creating…" : "Create user"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditAccessDialog({
  user,
  onClose,
  onSubmit,
  pending,
}: {
  user: AppUser;
  onClose: () => void;
  onSubmit: (v: { is_admin: boolean; nav_keys: string[] }) => void;
  pending: boolean;
}) {
  const [isAdmin, setIsAdmin] = useState(user.roles.includes("admin"));
  const [keys, setKeys] = useState<Set<string>>(new Set(user.nav_keys));

  function toggle(k: string) {
    const next = new Set(keys);
    if (next.has(k)) next.delete(k); else next.add(k);
    setKeys(next);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit access — {user.email}</DialogTitle></DialogHeader>
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Admin</div>
              <div className="text-xs text-muted-foreground">Full access to every page.</div>
            </div>
            <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
          </div>
          {!isAdmin && (
            <div className="space-y-2">
              <Label>Allowed pages</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                {NAV_ITEMS.filter((i) => !i.adminOnly).map((i) => (
                  <label key={i.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={keys.has(i.key)} onCheckedChange={() => toggle(i.key)} />
                    <i.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {i.title}
                  </label>
                ))}
              </div>
            </div>
          )}
          {!isAdmin && (
            <div className="rounded-md border p-4">
              <ActionPermissionsAdmin userId={user.id} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => onSubmit({ is_admin: isAdmin, nav_keys: isAdmin ? [] : Array.from(keys) })}
            disabled={pending}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSubmit,
  pending,
}: {
  user: AppUser;
  onClose: () => void;
  onSubmit: (password: string) => void;
  pending: boolean;
}) {
  const [password, setPassword] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset password — {user.email}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>New temporary password</Label>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
        </div>
        <DialogFooter>
          <Button onClick={() => onSubmit(password)} disabled={pending || password.length < 8}>
            {pending ? "Saving…" : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
