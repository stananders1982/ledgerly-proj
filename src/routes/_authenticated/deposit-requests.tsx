import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, X, Banknote, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyEmployee } from "@/lib/my-employee";
import { useCompanySettings } from "@/lib/settings";
import { methodFeePct, DEPOSIT_METHODS } from "@/lib/profitability";
import { getDisplayCurrency, fmtDate, fmtMoney } from "@/lib/format";
import { toDisplay } from "@/lib/fx";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountWithCurrency } from "@/components/amount-with-currency";
import { useCompanyBanks } from "@/components/company-banks-admin";
import {
  DEPOSIT_REQUEST_STATUS_LABELS,
  DEPOSIT_REQUEST_STATUS_TONE,
  isEditableByRequester,
  type DepositRequest,
} from "@/lib/deposit-requests";

export const Route = createFileRoute("/_authenticated/deposit-requests")({
  head: () => ({
    meta: [
      { title: "Deposit Requests — Ledgerly" },
      { name: "description", content: "Request bank details for a client deposit and track approval until the money lands." },
      { property: "og:title", content: "Deposit Requests — Ledgerly" },
      { property: "og:description", content: "Request bank details for a client deposit and track approval until the money lands." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DepositRequestsPage,
});

const REQUESTS_KEY = ["deposit-requests"] as const;

type ClientRow = {
  id: string;
  lead_name: string | null;
  employee_id: string | null;
  age: number | null;
  country: string | null;
  city: string | null;
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

function DepositRequestsPage() {
  const qc = useQueryClient();
  const { user, isAdmin, companyId } = useAuth();
  const { employee } = useMyEmployee();
  const settings = useCompanySettings();
  const { data: banks = [] } = useCompanyBanks(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [approving, setApproving] = useState<DepositRequest | null>(null);
  const [bankId, setBankId] = useState("");
  const [confirming, setConfirming] = useState<DepositRequest | null>(null);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmDate, setConfirmDate] = useState(new Date().toISOString().slice(0, 10));

  const requests = useQuery({
    enabled: !!companyId,
    queryKey: [...REQUESTS_KEY, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposit_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DepositRequest[];
    },
  });

  const clients = useQuery({
    enabled: !!companyId && open,
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
      return (data ?? []) as ClientRow[];
    },
  });

  const employees = useQuery({
    enabled: !!companyId,
    queryKey: ["employees-directory-deposits", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean }[];
    },
  });

  const employeeName = (id: string | null) =>
    employees.data?.find((e) => e.id === id)?.name ?? "—";
  const bankName = (id: string | null) => banks.find((b) => b.id === id)?.name ?? "—";

  const rows = requests.data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const awaiting = rows.filter((r) => r.status === "approved");
  const pendingValue = awaiting.reduce((s, r) => s + toDisplay(r.amount, r.currency), 0);

  const openNew = () => { setForm({ ...emptyForm, currency: getDisplayCurrency(), employee_id: employee?.id ?? "" }); setOpen(true); };
  const openEdit = (r: DepositRequest) => {
    setForm({
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
    });
    setOpen(true);
  };

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
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
      toast.success("Request submitted");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!approving) return;
      if (!bankId) throw new Error("Pick a bank");
      const { data: invoiceNo, error: rpcError } = await supabase.rpc("next_bank_invoice_no", { _bank_id: bankId });
      if (rpcError) throw rpcError;
      const { error } = await supabase
        .from("deposit_requests")
        .update({
          status: "approved",
          bank_id: bankId,
          invoice_no: invoiceNo as number,
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
          reject_reason: null,
        })
        .eq("id", approving.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: ["company-banks"] });
      toast.success("Approved — bank and invoice number assigned");
      setApproving(null);
      setBankId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from("deposit_requests")
        .update({ status: "rejected", reject_reason: reason || "No reason given" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: REQUESTS_KEY }); toast.success("Rejected"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!confirming) return;
      const amount = Number(confirmAmount) || Number(confirming.amount) || 0;
      const pct = methodFeePct(confirming.method, settings);
      const { data: rev, error: revError } = await supabase
        .from("revenue")
        .insert({
          company_id: companyId!,
          customer_name: confirming.client_name,
          activation_id: confirming.activation_id,
          employee_id: confirming.employee_id,
          amount,
          currency: confirming.currency !== getDisplayCurrency() ? confirming.currency : null,
          date: confirmDate,
          method: confirming.method,
          method_provider: bankName(confirming.bank_id),
          fee_pct: pct,
          fee_amount: amount * (pct / 100),
          notes: confirming.invoice_no ? `Deposit request · invoice #${confirming.invoice_no}` : "Deposit request",
        })
        .select("id")
        .single();
      if (revError) throw revError;
      const { error } = await supabase
        .from("deposit_requests")
        .update({
          status: "confirmed",
          confirmed_by: user!.id,
          confirmed_at: new Date().toISOString(),
          confirmed_amount: amount,
          confirmed_date: confirmDate,
          revenue_id: rev!.id,
        })
        .eq("id", confirming.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: ["revenue-list"] });
      qc.invalidateQueries({ queryKey: ["activations"] });
      toast.success("Confirmed — income recorded");
      setConfirming(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverse = useMutation({
    mutationFn: async (r: DepositRequest) => {
      if (r.revenue_id) {
        const { error } = await supabase.from("revenue").delete().eq("id", r.revenue_id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("deposit_requests")
        .update({ status: "approved", confirmed_at: null, confirmed_by: null, confirmed_amount: null, confirmed_date: null, revenue_id: null })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: ["revenue-list"] });
      toast.success("Confirmation reversed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fee = useMemo(() => methodFeePct(form.method, settings), [form.method, settings]);

  return (
    <div className="p-6">
      <PageHeader
        title="Deposit Requests"
        description="Ask for bank details, get admin approval, then confirm the money landed."
        actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> New request</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending approval" value={String(pending.length)} icon={Clock} />
        <StatCard label="Awaiting funds" value={String(awaiting.length)} icon={Banknote} />
        <StatCard label="Awaiting value" value={fmtMoney(pendingValue)} icon={Banknote} />
      </div>

      <div className="mt-6 grid gap-3">
        {requests.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Banknote} title="No deposit requests yet" description="Create one when a client is ready to deposit." />
        ) : (
          rows.map((r) => {
            const bank = banks.find((b) => b.id === r.bank_id);
            const mine = r.requested_by === user?.id;
            return (
              <div key={r.id} className="card-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.client_name}</span>
                      <Badge variant="outline" className={DEPOSIT_REQUEST_STATUS_TONE[r.status]}>
                        {DEPOSIT_REQUEST_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                      {r.first_deposit && <Badge variant="outline">First deposit</Badge>}
                      {r.invoice_no && <Badge variant="outline">Invoice #{r.invoice_no}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {Number(r.amount).toLocaleString()} {r.currency} · {fmtDate(r.request_date)} ·{" "}
                      {employeeName(r.employee_id)}
                      {r.geo ? ` · ${r.geo}` : ""}
                      {r.client_age ? ` · age ${r.client_age}` : ""}
                    </p>
                    {(isAdmin || mine) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Client bank: {r.client_bank || "—"}
                        {r.card_last4 ? ` · card ••${r.card_last4}` : ""}
                        {r.client_bank_details ? ` · ${r.client_bank_details}` : ""}
                        {r.client_address ? ` · ${r.client_address}` : ""}
                      </p>
                    )}
                    {r.note && <p className="mt-1 text-xs text-muted-foreground">Note: {r.note}</p>}
                    {r.status === "rejected" && (
                      <p className="mt-1 text-xs text-destructive">Rejected: {r.reject_reason}</p>
                    )}
                    {bank && (r.status === "approved" || r.status === "confirmed") && (
                      <div className="mt-2 rounded-md border p-2 text-xs">
                        <p className="font-medium">Pay into {bank.name} ({bank.currency})</p>
                        {bank.account_details && <p className="text-muted-foreground">Account: {bank.account_details}</p>}
                        {bank.bsb && <p className="text-muted-foreground">BSB: {bank.bsb}</p>}
                        {bank.swift && <p className="text-muted-foreground">SWIFT: {bank.swift}</p>}
                        {bank.instructions && <p className="text-muted-foreground">{bank.instructions}</p>}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {mine && isEditableByRequester(r.status) && (
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        {r.status === "rejected" ? "Edit & resubmit" : "Edit"}
                      </Button>
                    )}
                    {isAdmin && r.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => { setApproving(r); setBankId(r.bank_id ?? banks[0]?.id ?? ""); }}>
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const reason = window.prompt("Reason for rejection?") ?? "";
                            if (reason !== null) reject.mutate({ id: r.id, reason });
                          }}
                        >
                          <X className="h-4 w-4" /> Reject
                        </Button>
                      </>
                    )}
                    {isAdmin && r.status === "approved" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setConfirming(r);
                          setConfirmAmount(String(r.amount));
                          setConfirmDate(new Date().toISOString().slice(0, 10));
                        }}
                      >
                        <Check className="h-4 w-4" /> Money received
                      </Button>
                    )}
                    {isAdmin && r.status === "confirmed" && (
                      <Button variant="ghost" size="sm" onClick={() => reverse.mutate(r)}>Reverse</Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Request form */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Edit deposit request" : "Deposit request details"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
            <div className="grid gap-1.5">
              <Label className="text-xs">Client</Label>
              <Select value={form.activation_id} onValueChange={pickClient}>
                <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).filter((c) => c.lead_name).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.lead_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {form.id ? "Resubmit" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve */}
      <Dialog open={!!approving} onOpenChange={(v) => !v && setApproving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Approve deposit request</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {approving?.client_name} · {Number(approving?.amount ?? 0).toLocaleString()} {approving?.currency}
            </p>
            <div className="grid gap-1.5">
              <Label className="text-xs">Receiving bank</Label>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger><SelectValue placeholder="Pick a bank" /></SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name} · next #{b.next_invoice_no}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {banks.length === 0 && (
                <p className="text-xs text-muted-foreground">Add a bank in Settings first.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>Cancel</Button>
            <Button onClick={() => approve.mutate()} disabled={approve.isPending || !bankId}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm */}
      <Dialog open={!!confirming} onOpenChange={(v) => !v && setConfirming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirm money received</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Amount received ({confirming?.currency})</Label>
              <Input type="number" value={confirmAmount} onChange={(e) => setConfirmAmount(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Date received</Label>
              <Input type="date" value={confirmDate} onChange={(e) => setConfirmDate(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              This books the deposit as income for {confirming?.client_name}, applies the processing fee and feeds the agent's commission.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
