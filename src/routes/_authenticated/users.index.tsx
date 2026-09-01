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
  role_key?: string;
  department?: string | null;
  nav_keys: string[];
  nav_overrides?: { nav_key: string; allowed: boolean }[];
  is_super_admin?: boolean;
};

type UserFormValue = {
  is_admin: boolean;
  role_key: string;
  department: string | null;
  nav_keys: string[];
  manageable_keys: string[];
};

const DEPARTMENTS = [
  { key: "R", label: "Retention (R)" },
  { key: "C", label: "Conversion (C)" },
  { key: "M", label: "Management (M)" },
];

const DEPT_LABEL: Record<string, string> = { R: "Retention", C: "Conversion", M: "Management" };


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
    mutationFn: (v: UserFormValue & { email: string; password: string; full_name: string }) => create({ data: v }),
    onSuccess: () => {
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["app-users"] });
      setCreateOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create user"),
  });

  const updateMut = useMutation({
    mutationFn: (v: UserFormValue & { user_id: string }) => update({ data: v }),

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

  const { roles: roleOptions } = useRoles();
  const roleLabel = (key: string) => roleOptions.find((r) => r.key === key)?.label ?? key;

  if (permsLoaded && !isAdmin) return <Navigate to="/" />;


  const rows = (q.data ?? []) as AppUser[];
  const { sorted, sort, toggle } = useSort<AppUser>(rows, {
    name: (u: any) => u.name ?? "",
    email: (u: any) => u.email ?? "",
    role: (u: any) => (u.roles.includes("admin") ? "admin" : "user"),
    pages: (u: any) => (u.nav_permissions?.length ?? 0),
  });
  const { pageItems, ...pg } = usePagination(sorted, 30, "users");
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
              <TableHead>Department</TableHead>
              <TableHead>{th("Pages", "pages")}</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!q.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users yet.</TableCell></TableRow>
            )}
            {pageItems.map((u) => {
              const adm = u.roles.includes("admin");
              const locked = !!u.is_super_admin && !isSuperAdmin && u.id !== user?.id;
              const overrides = u.nav_overrides?.length ?? 0;
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
                      <Badge variant="secondary">{roleLabel(u.role_key ?? "agent")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.department ? (
                      <Badge variant="outline">{DEPT_LABEL[u.department] ?? u.department}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {adm ? (
                      <span className="text-xs text-muted-foreground">All pages</span>
                    ) : overrides === 0 ? (
                      <span className="text-xs text-muted-foreground">Role default</span>
                    ) : (
                      <span className="text-xs">{overrides} custom</span>
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

/** Page checklist + role/department pickers shared by both dialogs. */
function RoleDepartmentFields({
  roleKey,
  setRoleKey,
  department,
  setDepartment,
  roleOptions,
}: {
  roleKey: string;
  setRoleKey: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  roleOptions: { key: string; label: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select value={roleKey} onValueChange={setRoleKey}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {roleOptions.filter((r) => r.key !== "admin").map((r) => (
              <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">Sets the pages and actions this role normally gets.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Department</Label>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No department</SelectItem>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">Creates or links the matching employee record.</p>
      </div>
    </div>
  );
}

function PageChecklist({ keys, toggle }: { keys: Set<string>; toggle: (k: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
      {NAV_ITEMS.filter((i) => !i.adminOnly).map((i) => (
        <label key={i.key} className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={keys.has(i.key)} onCheckedChange={() => toggle(i.key)} />
          <i.icon className="h-3.5 w-3.5 text-muted-foreground" />
          {i.title}
        </label>
      ))}
    </div>
  );
}

function keysForRole(roleKey: string) {
  return new Set(MANAGEABLE_NAV_KEYS.filter((k) => defaultNavAllowed(roleKey, k)));
}

function CreateUserDialog({
  onSubmit,
  pending,
  roleOptions,
}: {
  onSubmit: (v: UserFormValue & { email: string; password: string; full_name: string }) => void;
  pending: boolean;
  roleOptions: { key: string; label: string }[];
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleKey, setRoleKey] = useState("agent");
  const [department, setDepartment] = useState("none");
  const [keys, setKeys] = useState<Set<string>>(() => keysForRole("agent"));

  function pickRole(v: string) {
    setRoleKey(v);
    setKeys(keysForRole(v));
    if (v === "retention") setDepartment("R");
    if (v === "agent") setDepartment("C");
  }

  function toggle(k: string) {
    const next = new Set(keys);
    if (next.has(k)) next.delete(k); else next.add(k);
    setKeys(next);
  }

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
          <>
            <RoleDepartmentFields
              roleKey={roleKey}
              setRoleKey={pickRole}
              department={department}
              setDepartment={setDepartment}
              roleOptions={roleOptions}
            />
            <div className="space-y-2">
              <Label>Pages this user can access</Label>
              <p className="text-[11px] text-muted-foreground">Pre-filled from the role — tick to override for this person.</p>
              <PageChecklist keys={keys} toggle={toggle} />
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              email,
              password,
              full_name: fullName,
              is_admin: isAdmin,
              role_key: isAdmin ? "admin" : roleKey,
              department: department === "none" ? null : department,
              nav_keys: isAdmin ? [] : Array.from(keys),
              manageable_keys: MANAGEABLE_NAV_KEYS as string[],
            })
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
  roleOptions,
}: {
  user: AppUser;
  onClose: () => void;
  onSubmit: (v: UserFormValue) => void;
  pending: boolean;
  roleOptions: { key: string; label: string }[];
}) {
  const [isAdmin, setIsAdmin] = useState(user.roles.includes("admin"));
  const [roleKey, setRoleKey] = useState(user.role_key && user.role_key !== "admin" ? user.role_key : "agent");
  const [department, setDepartment] = useState(user.department ?? "none");
  const [keys, setKeys] = useState<Set<string>>(() => {
    const base = keysForRole(user.role_key ?? "agent");
    for (const o of user.nav_overrides ?? []) {
      if (o.allowed) base.add(o.nav_key); else base.delete(o.nav_key);
    }
    // Legacy per-user rows still count as granted.
    for (const k of user.nav_keys) base.add(k);
    return base;
  });

  function pickRole(v: string) {
    setRoleKey(v);
    setKeys(keysForRole(v));
  }

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
            <>
              <RoleDepartmentFields
                roleKey={roleKey}
                setRoleKey={pickRole}
                department={department}
                setDepartment={setDepartment}
                roleOptions={roleOptions}
              />
              <div className="space-y-2">
                <Label>Allowed pages</Label>
                <p className="text-[11px] text-muted-foreground">Pre-filled from the role — tick to override for this person.</p>
                <PageChecklist keys={keys} toggle={toggle} />
              </div>
              <div className="rounded-md border p-4">
                <ActionPermissionsAdmin userId={user.id} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              onSubmit({
                is_admin: isAdmin,
                role_key: isAdmin ? "admin" : roleKey,
                department: department === "none" ? null : department,
                nav_keys: isAdmin ? [] : Array.from(keys),
                manageable_keys: MANAGEABLE_NAV_KEYS as string[],
              })
            }
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
