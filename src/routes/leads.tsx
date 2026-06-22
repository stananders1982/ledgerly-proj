import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { store, useStore, fmtMoney, type LeadStatus } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/leads")({
  head: () => ({ meta: [{ title: "Leads — Ledgerly" }] }),
  component: LeadsPage,
});

const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];
const statusTone: Record<LeadStatus, string> = {
  new: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  contacted: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  qualified: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  won: "bg-primary/20 text-primary border-primary/30",
  lost: "bg-destructive/20 text-destructive border-destructive/30",
};

function LeadsPage() {
  const { leads } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    source: "Google Ads",
    date: new Date().toISOString().slice(0, 10),
    cost: "",
    status: "new" as LeadStatus,
    activated: false,
    revenue: "",
  });

  const submit = () => {
    if (!form.source || !form.cost) return toast.error("Source and cost required");
    store.addLead({
      source: form.source,
      date: new Date(form.date).toISOString(),
      cost: Number(form.cost),
      status: form.status,
      activated: form.activated,
      revenue: Number(form.revenue || 0),
    });
    toast.success("Lead added");
    setOpen(false);
    setForm({ ...form, cost: "", revenue: "" });
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track lead acquisition cost, status, and revenue impact."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> New lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add lead</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <Field label="Source">
                  <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
                </Field>
                <Field label="Date">
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </Field>
                <Field label="Cost">
                  <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                </Field>
                <Field label="Status">
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as LeadStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <Label>Activated</Label>
                  <Switch checked={form.activated} onCheckedChange={(v) => setForm({ ...form, activated: v })} />
                </div>
                <Field label="Revenue generated">
                  <Input type="number" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} />
                </Field>
              </div>
              <DialogFooter>
                <Button onClick={submit}>Save lead</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Cost</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Activated</th>
                <th className="py-3 px-4">Revenue</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="py-3 px-4 font-medium">{l.source}</td>
                  <td className="py-3 px-4 text-muted-foreground">{new Date(l.date).toLocaleDateString()}</td>
                  <td className="py-3 px-4">{fmtMoney(l.cost)}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={`capitalize ${statusTone[l.status]}`}>{l.status}</Badge>
                  </td>
                  <td className="py-3 px-4">
                    {l.activated ? <span className="text-primary">●</span> : <span className="text-muted-foreground">○</span>}
                  </td>
                  <td className="py-3 px-4 font-medium">{fmtMoney(l.revenue)}</td>
                  <td className="py-3 px-4 text-right">
                    <Button size="icon" variant="ghost" onClick={() => store.deleteLead(l.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No leads yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
