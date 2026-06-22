import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { store, useStore, fmtMoney } from "@/lib/store";
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
import { toast } from "sonner";

export const Route = createFileRoute("/revenue")({
  head: () => ({ meta: [{ title: "Revenue — Ledgerly" }] }),
  component: RevenuePage,
});

function RevenuePage() {
  const { revenues } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    customer: "",
    amount: "",
    employee: "",
    leadSource: "",
  });

  const submit = () => {
    if (!form.customer || !form.amount) return toast.error("Customer and amount required");
    store.addRevenue({
      date: new Date(form.date).toISOString(),
      customer: form.customer,
      amount: Number(form.amount),
      employee: form.employee,
      leadSource: form.leadSource,
    });
    toast.success("Revenue recorded");
    setOpen(false);
    setForm({ ...form, customer: "", amount: "" });
  };

  const total = revenues.reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader
        title="Revenue"
        description="Log every customer sale, attribute it to the closer and the source."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> New sale</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record revenue</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                <Field label="Customer"><Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></Field>
                <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                <Field label="Employee responsible"><Input value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} /></Field>
                <Field label="Lead source"><Input value={form.leadSource} onChange={(e) => setForm({ ...form, leadSource: e.target.value })} /></Field>
              </div>
              <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="card-surface p-5 mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total recorded revenue</div>
          <div className="font-display text-3xl font-semibold mt-1 text-primary">{fmtMoney(total)}</div>
        </div>
        <div className="text-sm text-muted-foreground">{revenues.length} transactions</div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {revenues.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="py-3 px-4 text-muted-foreground">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="py-3 px-4 font-medium">{r.customer}</td>
                  <td className="py-3 px-4 text-primary font-medium">{fmtMoney(r.amount)}</td>
                  <td className="py-3 px-4">{r.employee || "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{r.leadSource || "—"}</td>
                  <td className="py-3 px-4 text-right">
                    <Button size="icon" variant="ghost" onClick={() => store.deleteRevenue(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {revenues.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No revenue yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}
