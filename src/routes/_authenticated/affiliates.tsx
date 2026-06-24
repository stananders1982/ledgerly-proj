import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users2, TrendingUp, AlertTriangle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/affiliates")({
  head: () => ({ meta: [{ title: "Affiliates — Ledgerly" }] }),
  component: AffiliatesPage,
});

type Affiliate = {
  id: string;
  name: string;
  email: string | null;
  cpa_rate: number;
  guarantee_type: "none" | "fixed" | "percentage";
  guarantee_value: number;
  guarantee_period: "daily" | "weekly" | "monthly";
  active: boolean;
};

type Event = {
  id: string;
  affiliate_id: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type Period = {
  id: string;
  affiliate_id: string;
  period_start: string;
  period_end: string;
  guaranteed_amount: number;
  actual_cpa_cost: number;
  shortfall_amount: number;
  status: "open" | "locked" | "paid";
};

function periodWindow(p: "daily" | "weekly" | "monthly", ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  if (p === "daily") return { start: d, end: d };
  if (p === "weekly") {
    const day = (d.getDay() + 6) % 7; // Mon=0
    const s = new Date(d); s.setDate(d.getDate() - day);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return { start: s, end: e };
  }
  const s = new Date(d.getFullYear(), d.getMonth(), 1);
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: s, end: e };
}

function AffiliatesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Affiliate | null>(null);

  const affQ = useQuery({
    queryKey: ["affiliates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("affiliates" as any).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Affiliate[];
    },
  });
  const evQ = useQuery({
    queryKey: ["affiliate_events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("affiliate_events" as any).select("*");
      if (error) throw error;
      return (data ?? []) as Event[];
    },
  });
  const perQ = useQuery({
    queryKey: ["affiliate_periods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("affiliate_guarantee_periods" as any).select("*");
      if (error) throw error;
      return (data ?? []) as Period[];
    },
  });

  const affiliates = affQ.data ?? [];
  const events = evQ.data ?? [];
  const periods = perQ.data ?? [];

  const upsert = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        email: v.email || null,
        cpa_rate: Number(v.cpa_rate) || 0,
        guarantee_type: v.guarantee_type,
        guarantee_value: Number(v.guarantee_value) || 0,
        guarantee_period: v.guarantee_period,
        active: !!v.active,
      };
      if (v.id) {
        const { error } = await supabase.from("affiliates" as any).update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("affiliates" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["affiliates"] });
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("affiliates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["affiliates"] });
      qc.invalidateQueries({ queryKey: ["affiliate_events"] });
      qc.invalidateQueries({ queryKey: ["affiliate_periods"] });
      toast.success("Deleted");
    },
  });

  // Compute per-affiliate metrics for current period
  const rows = useMemo(() => {
    return affiliates.map((a) => {
      const win = periodWindow(a.guarantee_period);
      const inPeriod = events.filter(
        (e) =>
          e.affiliate_id === a.id &&
          e.status !== "rejected" &&
          new Date(e.created_at) >= win.start &&
          new Date(e.created_at) <= new Date(win.end.getTime() + 86400000 - 1),
      );
      const cpaCost = inPeriod.reduce((s, e) => s + Number(e.amount), 0);
      const guaranteed = a.guarantee_type === "fixed" ? Number(a.guarantee_value) : 0;
      const shortfall = Math.max(0, guaranteed - cpaCost);

      const allEvents = events.filter((e) => e.affiliate_id === a.id && e.status !== "rejected");
      const allEventsCost = allEvents.reduce((s, e) => s + Number(e.amount), 0);
      const openShortfall = periods
        .filter((p) => p.affiliate_id === a.id && p.status !== "paid")
        .reduce((s, p) => s + Number(p.shortfall_amount), 0);
      const liability = allEventsCost + openShortfall;

      let risk: "healthy" | "moderate" | "high" = "healthy";
      if (shortfall > 0 || liability > guaranteed * 2) risk = "high";
      else if (cpaCost > guaranteed * 0.5) risk = "moderate";

      return { a, cpaCost, guaranteed, shortfall, liability, risk };
    });
  }, [affiliates, events, periods]);

  const totals = useMemo(() => {
    const cpa = events
      .filter((e) => e.status !== "rejected")
      .reduce((s, e) => s + Number(e.amount), 0);
    const shortfalls = periods
      .filter((p) => p.status !== "paid")
      .reduce((s, p) => s + Number(p.shortfall_amount), 0);
    const guaranteed = affiliates
      .filter((a) => a.guarantee_type === "fixed")
      .reduce((s, a) => s + Number(a.guarantee_value), 0);
    return { cpa, shortfalls, guaranteed, liability: cpa + shortfalls };
  }, [events, periods, affiliates]);

  return (
    <div>
      <PageHeader
        title="Affiliates"
        description="CPA partners with guarantee tracking and finance-grade liability ledger."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add affiliate</Button>
            </DialogTrigger>
            <AffDialog aff={editing} onSubmit={(v) => upsert.mutate(v)} loading={upsert.isPending} />
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={TrendingUp} label="Total CPA cost" value={fmtMoney(totals.cpa)} />
        <StatCard icon={Shield} label="Guaranteed obligation" value={fmtMoney(totals.guaranteed)} />
        <StatCard icon={AlertTriangle} label="Open shortfalls" value={fmtMoney(totals.shortfalls)} />
        <StatCard icon={Users2} label="Total liability" value={fmtMoney(totals.liability)} />
      </div>

      <div className="card-surface overflow-hidden">
        {affQ.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="No affiliates yet"
            description="Add your first CPA partner to start tracking liability."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add affiliate</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Affiliate</th>
                  <th className="py-3 px-4">CPA rate</th>
                  <th className="py-3 px-4">Guarantee</th>
                  <th className="py-3 px-4">Period CPA cost</th>
                  <th className="py-3 px-4">Shortfall</th>
                  <th className="py-3 px-4">Total liability</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, cpaCost, guaranteed, shortfall, liability, risk }) => (
                  <tr key={a.id} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditing(a); setOpen(true); }}>
                    <td className="py-3 px-4">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.email || "—"}</div>
                    </td>
                    <td className="py-3 px-4">{fmtMoney(a.cpa_rate)}</td>
                    <td className="py-3 px-4 text-xs">
                      {a.guarantee_type === "none" ? (
                        <span className="text-muted-foreground">None</span>
                      ) : (
                        <span>
                          {a.guarantee_type === "fixed" ? fmtMoney(a.guarantee_value) : `${a.guarantee_value}%`}
                          <span className="text-muted-foreground"> / {a.guarantee_period}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">{fmtMoney(cpaCost)}</td>
                    <td className={"py-3 px-4 " + (shortfall > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {fmtMoney(shortfall)}
                    </td>
                    <td className="py-3 px-4 font-medium">{fmtMoney(liability)}</td>
                    <td className="py-3 px-4">
                      <Badge variant={risk === "high" ? "destructive" : risk === "moderate" ? "secondary" : "default"}>
                        {risk === "high" ? "🔴 High" : risk === "moderate" ? "🟡 Moderate" : "🟢 Healthy"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <ConfirmDelete onConfirm={() => del.mutate(a.id)} label="Delete affiliate?" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AffDialog({
  aff, onSubmit, loading,
}: { aff: Affiliate | null; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = useState(() => ({
    id: aff?.id,
    name: aff?.name ?? "",
    email: aff?.email ?? "",
    cpa_rate: aff?.cpa_rate ?? 0,
    guarantee_type: aff?.guarantee_type ?? "none",
    guarantee_value: aff?.guarantee_value ?? 0,
    guarantee_period: aff?.guarantee_period ?? "monthly",
    active: aff?.active ?? true,
  }));
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{aff?.id ? "Edit affiliate" : "New affiliate"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email (optional)">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="CPA rate (per conversion)">
          <Input type="number" min={0} step="0.01" value={form.cpa_rate}
            onChange={(e) => setForm({ ...form, cpa_rate: Number(e.target.value) })} />
        </Field>

        <div className="rounded-md border border-border p-3 grid gap-3">
          <Label className="text-sm font-medium">Guarantee</Label>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Type">
              <Select value={form.guarantee_type} onValueChange={(v: any) => setForm({ ...form, guarantee_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                  <SelectItem value="percentage">% of revenue</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Value">
              <Input type="number" min={0} step="0.01" value={form.guarantee_value}
                disabled={form.guarantee_type === "none"}
                onChange={(e) => setForm({ ...form, guarantee_value: Number(e.target.value) })} />
            </Field>
            <Field label="Period">
              <Select value={form.guarantee_period} onValueChange={(v: any) => setForm({ ...form, guarantee_period: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <Label className="text-sm">Active</Label>
          <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.name}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
