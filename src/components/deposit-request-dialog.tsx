/**
 * The deposit-request form, shared by the Deposit Requests page and the client
 * profile. Pass `client` to lock the request to one client (the profile case);
 * pass `edit` to reopen an existing request for correction/resubmission.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyEmployee } from "@/lib/my-employee";
import { useCompanySettings } from "@/lib/settings";
import { methodFeePct, DEPOSIT_METHODS } from "@/lib/profitability";
import { getDisplayCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountWithCurrency } from "@/components/amount-with-currency";
import { useCompanyBanks } from "@/components/company-banks-admin";
import type { DepositRequest } from "@/lib/deposit-requests";

export type DepositRequestClient = {
  id: string;
  lead_name: string | null;
  employee_id: string | null;
  age: number | null;
  country: string | null;
  city?: string | null;
};

const emptyForm = {
  id: "",
  activation_id: "",
  client_name: "",
  employee_id: "",
  request_date: new Date().toISOString().slice(0, 10),
  amount: "",
  currency: getDisplayCurrency(),
  client_bank: "",
  first_deposit: false,
  client_age: "",
  geo: "",
  client_address: "",
  client_bank_details: "",
  card_last4: "",
  method: "wire",
  bank_id: "",
  note: "",
};

type FormState = typeof emptyForm;

export function formFromRequest(r: DepositRequest): FormState {
  return {
    id: r.id,
    activation_id: r.activation_id ?? "",
    client_name: r.client_name,
    employee_id: r.employee_id ?? "",
    request_date: r.request_date,
    amount: String(r.amount ?? ""),
    currency: r.currency,
    client_bank: r.client_bank ?? "",
    first_deposit: r.first_deposit,
    client_age: r.client_age == null ? "" : String(r.client_age),
    geo: r.geo ?? "",
    client_address: r.client_address ?? "",
    client_bank_details: r.client_bank_details ?? "",
    card_last4: r.card_last4 ?? "",
    method: r.method ?? "wire",
    bank_id: r.bank_id ?? "",
    note: r.note ?? "",
  };
}

export function DepositRequestDialog({
  open,
  onOpenChange,
  edit,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Existing request being corrected. */
  edit?: DepositRequest | null;
  /** Lock the request to this client (client profile). */
  client?: DepositRequestClient | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const { user, isAdmin, companyId } = useAuth();
  const { employee } = useMyEmployee();
  const settings = useCompanySettings();
  const { data: banks = [] } = useCompanyBanks(true);

  const initial = (): FormState => {
    if (edit) return formFromRequest(edit);
    const base = { ...emptyForm, currency: getDisplayCurrency(), employee_id: employee?.id ?? "" };
    if (client) {
      return {
        ...base,
        activation_id: client.id,
        client_name: client.lead_name ?? "",
        employee_id: base.employee_id || client.employee_id || "",
        client_age: client.age == null ? "" : String(client.age),
        geo: client.country ?? "",
      };
    }
    return base;
  };

  const [form, setForm] = useState<FormState>(initial);
  const [seen, setSeen] = useState<string | null>(null);
  const signature = `${open}|${edit?.id ?? ""}|${client?.id ?? ""}`;
  if (open && seen !== signature) {
    setSeen(signature);
    setForm(initial());
  }
  if (!open && seen !== null) setSeen(null);

  const clients = useQuery({
    enabled: !!companyId && open && !client,
    queryKey: ["deposit-request-clients", companyId, employee?.id, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from("daily_lead_activations")
        .select("id,lead_name,employee_id,age,country,city")
        .order("activation_date", { ascending: false })
        .limit(500);
      if (!isAdmin && employee?.id) q = q.eq("employee_id", employee.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DepositRequestClient[];
    },
  });

  const employees = useQuery({
    enabled: !!companyId && open,
    queryKey: ["employees-directory-deposits", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean }[];
    },
  });

  const pickClient = (id: string) => {
    const c = clients.data?.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      activation_id: id,
      client_name: c?.lead_name ?? f.client_name,
      employee_id: f.employee_id || c?.employee_id || "",
      client_age: c?.age == null ? f.client_age : String(c.age),
      geo: c?.country ?? f.geo,
    }));
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.activation_id) throw new Error("Pick a client");
      if (!(Number(form.amount) > 0)) throw new Error("Enter an amount");
      const payload = {
        company_id: companyId!,
        activation_id: form.activation_id,
        client_name: form.client_name.trim() || "Client",
        employee_id: form.employee_id || null,
        request_date: form.request_date,
        amount: Number(form.amount),
        currency: form.currency,
        client_bank: form.client_bank.trim() || null,
        first_deposit: form.first_deposit,
        client_age: form.client_age ? Number(form.client_age) : null,
        geo: form.geo.trim() || null,
        client_address: form.client_address.trim() || null,
        client_bank_details: form.client_bank_details.trim() || null,
        card_last4: form.card_last4.trim().slice(-4) || null,
        method: form.method || null,
        bank_id: form.bank_id || null,
        note: form.note.trim() || null,
        status: "pending",
        reject_reason: null,
      };
      if (form.id) {
        const { error } = await supabase.from("deposit_requests").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("deposit_requests")
          .insert({ ...payload, requested_by: user!.id, requested_by_email: user?.email ?? null });
        if (error) throw error;
        await supabase.from("notifications").insert({
          company_id: companyId!,
          type: "deposit_request",
          title: "Deposit request awaiting approval",
          body: `${payload.client_name} — ${payload.amount} ${payload.currency}`,
          lead_activation_id: payload.activation_id,
          lead_name: payload.client_name,
          amount: payload.amount,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deposit-requests"] });
      qc.invalidateQueries({ queryKey: ["client-deposit-requests"] });
      toast.success("Request submitted");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fee = useMemo(() => methodFeePct(form.method, settings), [form.method, settings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{form.id ? "Edit deposit request" : "Deposit request details"}</DialogTitle></DialogHeader>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label className="text-xs">Client</Label>
            {client ? (
              <Input value={client.lead_name ?? "Client"} readOnly className="bg-muted/40" />
            ) : (
              <Select value={form.activation_id} onValueChange={pickClient}>
                <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).filter((c) => c.lead_name).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.lead_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Agent</Label>
              <Select
                value={form.employee_id || "_none"}
                disabled={!isAdmin && !!employee?.id}
                onValueChange={(v) => setForm({ ...form, employee_id: v === "_none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Pick agent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Unassigned</SelectItem>
                  {(employees.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Amount</Label>
            <AmountWithCurrency
              value={form.amount}
              currency={form.currency}
              onValueChange={(v) => setForm({ ...form, amount: v })}
              onCurrencyChange={(v) => setForm({ ...form, currency: v })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Method</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPOSIT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {fee > 0 && <p className="text-xs text-muted-foreground">{fee}% processing fee on confirmation.</p>}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Client bank</Label>
              <Input value={form.client_bank} onChange={(e) => setForm({ ...form, client_bank: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Receiving bank (suggested)</Label>
            <Select
              value={form.bank_id || "_none"}
              onValueChange={(v) => setForm({ ...form, bank_id: v === "_none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="Let the admin choose" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Let the admin choose</SelectItem>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name} · {b.currency}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {banks.length === 0
                ? "No banks yet — an admin adds them under Banks in the sidebar."
                : "The admin confirms the bank on approval and the invoice number is assigned then."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.first_deposit} onCheckedChange={(v) => setForm({ ...form, first_deposit: v })} />
            <Label className="text-xs">First deposit</Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Client age</Label>
              <Input type="number" value={form.client_age} onChange={(e) => setForm({ ...form, client_age: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">GEO</Label>
              <Input value={form.geo} onChange={(e) => setForm({ ...form, geo: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Client full address</Label>
            <Textarea rows={2} value={form.client_address} onChange={(e) => setForm({ ...form, client_address: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Client bank details</Label>
            <Textarea rows={3} value={form.client_bank_details} onChange={(e) => setForm({ ...form, client_bank_details: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Last 4 digits of credit card</Label>
            <Input maxLength={4} value={form.card_last4} onChange={(e) => setForm({ ...form, card_last4: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Note to admin</Label>
            <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {form.id ? "Resubmit" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
