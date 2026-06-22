import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  store,
  useStore,
  fmtMoney,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/lib/store";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Ledgerly" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { expenses } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: "Marketing" as ExpenseCategory,
    amount: "",
    note: "",
  });

  const submit = () => {
    if (!form.amount) return toast.error("Amount required");
    store.addExpense({
      date: new Date(form.date).toISOString(),
      category: form.category,
      amount: Number(form.amount),
      note: form.note,
    });
    toast.success("Expense added");
    setOpen(false);
    setForm({ ...form, amount: "", note: "" });
  };

  const totalsByCat = EXPENSE_CATEGORIES.map((cat) => ({
    cat,
    total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  }));

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Categorize and monitor every outflow across the business."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> New expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add expense</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <Field label="Date">
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </Field>
                <Field label="Category">
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Amount">
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </Field>
                <Field label="Note (optional)">
                  <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
              </div>
              <DialogFooter>
                <Button onClick={submit}>Save expense</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {totalsByCat.map((t) => (
          <div key={t.cat} className="card-surface p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.cat}</div>
            <div className="font-display text-lg font-semibold mt-1">{fmtMoney(t.total)}</div>
          </div>
        ))}
      </div>

      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Note</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="py-3 px-4 text-muted-foreground">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="py-3 px-4"><Badge variant="outline">{e.category}</Badge></td>
                  <td className="py-3 px-4 font-medium">{fmtMoney(e.amount)}</td>
                  <td className="py-3 px-4 text-muted-foreground">{e.note || "—"}</td>
                  <td className="py-3 px-4 text-right">
                    <Button size="icon" variant="ghost" onClick={() => store.deleteExpense(e.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">No expenses yet</td></tr>
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
