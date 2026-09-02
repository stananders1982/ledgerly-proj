/**
 * Company bank accounts used to receive client deposits. Each bank keeps its
 * own invoice counter (starting at 600) which is consumed on approval.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FX_CURRENCIES } from "@/lib/fx";
import { useAuth } from "@/lib/auth-context";
import type { CompanyBank } from "@/lib/deposit-requests";

export const COMPANY_BANKS_KEY = ["company-banks"] as const;

export function useCompanyBanks(onlyActive = false) {
  const { companyId } = useAuth();
  return useQuery({
    enabled: !!companyId,
    queryKey: [...COMPANY_BANKS_KEY, companyId, onlyActive],
    queryFn: async () => {
      let q = supabase
        .from("company_banks")
        .select("id,name,account_details,bsb,swift,currency,instructions,invoice_start,next_invoice_no,active")
        .order("active", { ascending: false })
        .order("name");
      if (onlyActive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CompanyBank[];
    },
  });
}

const blank = {
  id: "",
  name: "",
  account_details: "",
  bsb: "",
  swift: "",
  currency: "USD",
  instructions: "",
  invoice_start: "600",
  active: true,
};

export function CompanyBanksAdmin() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  const { data: banks = [], isLoading } = useCompanyBanks();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });

  const edit = (b: CompanyBank) => {
    setForm({
      id: b.id,
      name: b.name,
      account_details: b.account_details ?? "",
      bsb: b.bsb ?? "",
      swift: b.swift ?? "",
      currency: b.currency ?? "USD",
      instructions: b.instructions ?? "",
      invoice_start: String(b.invoice_start ?? 600),
      active: b.active,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Bank name is required");
      const start = Number(form.invoice_start) || 600;
      const payload = {
        company_id: companyId!,
        name: form.name.trim(),
        account_details: form.account_details.trim() || null,
        bsb: form.bsb.trim() || null,
        swift: form.swift.trim() || null,
        currency: form.currency,
        instructions: form.instructions.trim() || null,
        invoice_start: start,
        active: form.active,
      };
      if (form.id) {
        const { error } = await supabase.from("company_banks").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_banks")
          .insert({ ...payload, next_invoice_no: start });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COMPANY_BANKS_KEY });
      toast.success("Bank saved");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card-surface mt-6 grid gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Banks</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Accounts clients pay into. Each bank numbers its own invoices, starting from the number you set.
          </p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...blank }); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add bank
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : banks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No banks yet. Add one so deposit requests can be approved.</p>
      ) : (
        <div className="grid gap-2">
          {banks.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{b.name}</span>
                  <Badge variant="outline">{b.currency}</Badge>
                  {!b.active && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {b.account_details || "No account details"} · next invoice #{b.next_invoice_no}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => edit(b)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Edit bank" : "Add bank"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Bank name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FX_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Invoice starts at</Label>
                <Input
                  type="number"
                  value={form.invoice_start}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, invoice_start: e.target.value })}
                />
                {form.id && <p className="text-xs text-muted-foreground">Locked once the bank is in use.</p>}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Account / IBAN</Label>
              <Input value={form.account_details} onChange={(e) => setForm({ ...form, account_details: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">BSB / Sort code</Label>
              <Input value={form.bsb} onChange={(e) => setForm({ ...form, bsb: e.target.value })} placeholder="e.g. 062-000" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">SWIFT / BIC</Label>
              <Input value={form.swift} onChange={(e) => setForm({ ...form, swift: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Payment instructions shown to agents</Label>
              <Textarea
                rows={3}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
