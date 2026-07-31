import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Landmark, Loader2, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCompany, deleteCompany, listCompanies, updateCompany } from "@/lib/company.functions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/companies")({
  head: () => ({
    meta: [
      { title: "Companies — Ledgerly" },
      { name: "description", content: "Manage every company workspace on the platform from one place." },
      { property: "og:title", content: "Companies — Ledgerly" },
      { property: "og:description", content: "Create and manage company workspaces and their first admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const { isSuperAdmin, companyId, switchCompany } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listCompanies);
  const create = useServerFn(createCompany);
  const update = useServerFn(updateCompany);
  const remove = useServerFn(deleteCompany);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["companies-admin"],
    queryFn: () => list(),
    enabled: isSuperAdmin,
  });

  const toggle = useMutation({
    mutationFn: (v: { company_id: string; active: boolean }) => update({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies-admin"] });
      toast.success("Company updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const del = useMutation({
    mutationFn: (company_id: string) => remove({ data: { company_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies-admin"] });
      toast.success("Company deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  if (!isSuperAdmin) {
    return (
      <EmptyState
        icon={Landmark}
        title="Platform owners only"
        description="This page is available to the platform owner account."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Every company workspace on the platform. Data is fully isolated per company."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New company
          </Button>
        }
      />

      <div className="card-surface overflow-x-auto scroll-slim">
        {isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : !data?.length ? (
          <EmptyState icon={Landmark} title="No companies yet" description="Create the first company workspace." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {c.name}
                      {c.id === companyId && <Badge variant="secondary">Current</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.member_count}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => toggle.mutate({ company_id: c.id, active: v })}
                    />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={c.id === companyId}
                      onClick={async () => {
                        try {
                          await switchCompany(c.id);
                          toast.success(`Now working in ${c.name}`);
                        } catch (e: any) {
                          toast.error(e?.message ?? "Switch failed");
                        }
                      }}
                    >
                      Switch to
                    </Button>
                    {c.id !== companyId && (
                      <ConfirmDelete
                        label={`Delete ${c.name}?`}
                        description="This permanently removes the company, its users and all of its data. This cannot be undone."
                        onConfirm={() => del.mutate(c.id)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <NewCompanyDialog
        open={open}
        onOpenChange={setOpen}
        onCreate={async (values) => {
          await create({ data: values });
          qc.invalidateQueries({ queryKey: ["companies-admin"] });
        }}
      />
    </div>
  );
}

function NewCompanyDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (v: {
    name: string;
    admin_email: string;
    admin_password: string;
    admin_full_name: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onCreate({ name, admin_email: email, admin_password: password, admin_full_name: adminName });
      toast.success("Company created");
      setName("");
      setAdminName("");
      setEmail("");
      setPassword("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not create company");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New company</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-2">
            <Label>Company name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Admin full name</Label>
            <Input required value={adminName} onChange={(e) => setAdminName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Admin email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Admin password</Label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
