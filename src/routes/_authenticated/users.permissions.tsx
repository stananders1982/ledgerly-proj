import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { PermissionMatrix } from "@/components/permission-matrix";
import { RolesAdmin, RoleSelect } from "@/components/roles-admin";
import { UserOverridesDrawer, useWorkspaceMembers, type OverrideUser } from "@/components/user-overrides-drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/users/permissions")({
  head: () => ({
    meta: [
      { title: "Permissions Management — Ledgerly" },
      { name: "description", content: "Control which pages and actions each role and user can access in your workspace." },
      { property: "og:title", content: "Permissions Management — Ledgerly" },
      { property: "og:description", content: "Control which pages and actions each role and user can access in your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PermissionsPage,
});

function PermissionsPage() {
  const { isAdmin, companyId, user: me } = useAuth();
  const qc = useQueryClient();
  const membersQ = useWorkspaceMembers();
  const [drawerUser, setDrawerUser] = useState<OverrideUser | null>(null);

  const setRole = useMutation({
    mutationFn: async (v: { userId: string; roleKey: string }) => {
      const { data, error } = await supabase
        .from("company_users")
        .update({ role_key: v.roleKey })
        .eq("company_id", companyId!)
        .eq("user_id", v.userId)
        .select("user_id");
      if (error) throw error;
      if (!data?.length) throw new Error("Role not changed — you may not have permission to edit this member.");
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["workspace-members"] });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-explicit"] });
      qc.invalidateQueries({ queryKey: ["my-role-key"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not change role"),
  });

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="mt-1 text-sm text-muted-foreground">You don't have permission to manage access.</p>
      </div>
    );
  }

  const members = membersQ.data ?? [];

  return (
    <div>
      <PageHeader
        title="Permissions"
        description="Decide what each role can see and do, then fine-tune individual people."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/activity">
                <History className="h-4 w-4" /> Permission change history
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/users">
                <ArrowLeft className="h-4 w-4" /> Users
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="pages" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pages">Page Access</TabsTrigger>
          <TabsTrigger value="actions">Action Permissions</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Greyed rows are always available to admins. Changes save immediately for every user with that role.
          </p>
          <PermissionMatrix kind="nav" />
        </TabsContent>

        <TabsContent value="actions" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Admins always keep every action — their column is locked.
          </p>
          <PermissionMatrix kind="action" />
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose which blocks of the dashboard each role sees. Hidden blocks are not loaded at all.
          </p>
          <PermissionMatrix kind="dashboard" />
        </TabsContent>

        <TabsContent value="roles">
          <RolesAdmin />
        </TabsContent>
      </Tabs>

      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <h2 className="font-semibold">Per-user overrides</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Grant or block individual pages and actions for one person, regardless of their role.
        </p>

        <div className="mt-4 overflow-x-auto">
          {membersQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No users in this workspace yet. Invite someone from the Users page first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Overrides</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.full_name || m.email}</div>
                      {m.isAdmin && (
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          Admin
                        </Badge>
                      )}
                      {m.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell>
                      <RoleSelect
                        value={m.roleKey}
                        disabled={m.id === me?.id || setRole.isPending}
                        onChange={(v) => setRole.mutate({ userId: m.id, roleKey: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setDrawerUser(m)}>
                        Edit overrides
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <UserOverridesDrawer user={drawerUser} onClose={() => setDrawerUser(null)} />
    </div>
  );
}
