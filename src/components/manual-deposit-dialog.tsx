/**
 * Admin-only "Add deposit" form. Books an income row straight against a client,
 * skipping the request/approval flow entirely.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCompanySettings } from "@/lib/settings";
import { methodFeePct, DEPOSIT_METHODS } from "@/lib/profitability";
import { getDisplayCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountWithCurrency } from "@/components/amount-with-currency";

export type ManualDepositClient = {
  id: string;
  lead_name: string | null;
  employee_id: string | null;
};

export function ManualDepositDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client: ManualDepositClient;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const { companyId, isAdmin } = useAuth();
  const settings = useCompanySettings();

  const empty = () => ({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: getDisplayCurrency(),
    method: "wire",
    employee_id: client.employee_id ?? "",
    notes: "",
  });
  const [form, setForm] = useState(empty);
  const [seen, setSeen] = useState<string | null>(null);
  const signature = `${open}|${client.id}`;
  if (open && seen !== signature) {
    setSeen(signature);
    setForm(empty());
  }
  if (!open && seen !== null) setSeen(null);

  const employees = useQuery({
    enabled: !!companyId && open,
    queryKey: ["employees-directory-manual-deposit", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean }[];
    },
  });

  const fee = methodFeePct(form.method, settings);

  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount) || 0;
      if (!(amount > 0)) throw new Error("Enter an amount");
      const { error } = await supabase.from("revenue").insert({
        company_id: companyId!,
        customer_name: client.lead_name || "Client",
        activation_id: client.id,
        employee_id: form.employee_id || null,
        amount,
        currency: form.currency !== getDisplayCurrency() ? form.currency : null,
        date: form.date,
        method: form.method || null,
        notes: form.notes.trim() || null,
        fee_pct: fee,
        fee_amount: amount * (fee / 100),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of [
        ["revenue-list"],
        ["revenue"],
        ["activations"],
        ["client-deposits"],
        ["client-deposit-history"],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
      toast.success("Deposit added");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add deposit — {client.lead_name || "Client"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPOSIT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Amount</Label>
            <AmountWithCurrency
              value={form.amount}
              currency={form.currency}
              onValueChange={(v) => setForm((f) => ({ ...f, amount: v }))}
              onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">Processing fee applied: {fee}%</p>
          </div>
          <div>
            <Label>Agent</Label>
            <Select
              value={form.employee_id || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, employee_id: v === "none" ? "" : v }))}
            >
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(employees.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Add deposit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
