import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, Building2, TrendingUp, Wallet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useExporters } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney, getDisplayCurrency } from "@/lib/format";
import { toDisplay } from "@/lib/fx";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { cn } from "@/lib/utils";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination , TableCountBar} from "@/components/pagination";
import { deliveryPct, sumWeeks, weekStartOf, weeklyGuarantee, mergeWeekRows, weeklyLedger, affiliateNet, balanceActive, openingBalance, balanceAlert, type LeadEntryLike } from "@/lib/affiliate-balance";

type AffRow = { id: string; name: string; active: boolean; cpa_rate: number; guarantee_value: number; group_key: string | null; balance_start_date: string | null; opening_balance: number | null; balance_activated_at: string | null; alert_threshold: number | null };


export const Route = createFileRoute("/_authenticated/affiliates/$id")({
  head: () => ({
    meta: [
      { title: "Affiliate Statement — Ledgerly" },
      { name: "description", content: "Monthly affiliate statement: revenue, withdrawals and net balance." },
      { property: "og:title", content: "Affiliate Statement — Ledgerly" },
      { property: "og:description", content: "Monthly affiliate statement: revenue, withdrawals and net balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AffiliateStatementPage,
});

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AffiliateStatementPage() {
  const { exportPDF } = useExporters();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { id } = useParams({ from: "/_authenticated/affiliates/$id" });
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const activeRange = useMemo(() => {
    const r = getRange(range, { start: customStart, end: customEnd });
    // Affiliates settle Mon–Sun, so "Week" means the current settlement week.
    if (range !== "week") return r;
    return { ...r, start: new Date(weekStartOf(isoOf(r.end)) + "T00:00:00"), label: "This week" };
  }, [range, customStart, customEnd]);
  const inRange = (d: string) => {
    const t = new Date(d + "T12:00:00").getTime();
    return t >= activeRange.start.getTime() && t <= activeRange.end.getTime();
  };


  // An affiliate can share a billing group with other sources (e.g. one flat and
  // one with a guarantee). Payments and balance are shared across the group.
  const groupQ = useQuery({
    queryKey: ["affiliate-group", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliates")
        .select("id,name,active,cpa_rate,guarantee_value,group_key,balance_start_date,opening_balance,balance_activated_at,alert_threshold")
        .eq("id", id)
        .single();
      if (error) throw error;
      const self = data as AffRow;
      if (!self.group_key?.trim()) return { self, members: [self] };
      const { data: rest, error: e2 } = await supabase
        .from("affiliates")
        .select("id,name,active,cpa_rate,guarantee_value,group_key,balance_start_date,opening_balance,balance_activated_at,alert_threshold")
        .eq("group_key", self.group_key)
        .order("name");
      if (e2) throw e2;
      const members = ((rest ?? []) as AffRow[]).length ? ((rest ?? []) as AffRow[]) : [self];
      return { self, members };
    },
  });
  const affQ = { data: groupQ.data?.self };
  const members = useMemo(() => groupQ.data?.members ?? [], [groupQ.data]);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const groupLabel = groupQ.data?.self.group_key?.trim() || null;

  const srcQ = useQuery({
    queryKey: ["affiliate-sources-one", memberIds.join(",")],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_sources").select("id,name");
      if (error) throw error;
      const names = new Set(members.map((m) => m.name.trim().toLowerCase()));
      return ((data ?? []) as { id: string; name: string }[]).filter((s) =>
        names.has(s.name.trim().toLowerCase()),
      );
    },
  });

  const entriesQ = useQuery({
    queryKey: ["affiliate-entries-one", id],
    queryFn: async () => {
      const data = await fetchAll(() =>
        supabase.from("daily_lead_entries").select("entry_date,received,invalid,reported,activated,source_id"),
      );
      return (data ?? []) as LeadEntryLike[];
    },
  });

  // Money only counts from the day charging starts — the app took over part-way
  // through the year, so earlier weeks and top-ups are never counted at all.
  const balanceOn = balanceActive(groupQ.data?.self);
  const balanceStart = groupQ.data?.self?.balance_start_date ?? null;
  const inMoneyRange = (d: string) =>
    balanceOn && inRange(d) && (!balanceStart || d >= balanceStart);

  // Charging start date lives here, next to the money it controls.
  const opening = openingBalance(groupQ.data?.self);
  const [activating, setActivating] = useState(false);
  const [actForm, setActForm] = useState({ start: "", opening: "", threshold: "" });
  const alertThreshold = Number(groupQ.data?.self?.alert_threshold || 0);
  useEffect(() => {
    if (activating)
      setActForm({
        start: balanceStart ?? isoOf(new Date()),
        opening: opening ? String(opening) : "",
        threshold: alertThreshold ? String(alertThreshold) : "",
      });
  }, [activating, balanceStart, opening, alertThreshold]);

  const saveActivation = useMutation({
    mutationFn: async (mode: "on" | "off") => {
      const patch =
        mode === "off"
          ? { balance_activated_at: null, balance_start_date: null, opening_balance: 0, alert_threshold: null }
          : {
              balance_activated_at: new Date().toISOString(),
              balance_start_date: actForm.start,
              // Only figure carried over from before the start date.
              opening_balance: Number(actForm.opening) || 0,
              // Warn when the running balance lands inside ±threshold.
              alert_threshold: Number(actForm.threshold) > 0 ? Number(actForm.threshold) : null,
            };
      // Billing-group members share one balance, so they share activation too.
      let q = supabase.from("affiliates").update(patch);
      q = groupLabel ? q.eq("group_key", groupLabel) : q.eq("id", id);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_d, mode) => {
      toast.success(mode === "off" ? "Charging turned off" : "Charging start saved");
      setActivating(false);
      qc.invalidateQueries({ queryKey: ["affiliate-group", id] });
      qc.invalidateQueries({ queryKey: ["affiliates-list"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });



  // Revenue and withdrawals stay per source — performance is measured per
  // affiliate source, only payments/balance are shared across a billing group.
  const revQ = useQuery({
    queryKey: ["affiliate-revenue", id],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("revenue")
        .select("id,date,amount,customer_name,created_at")
        .eq("affiliate_id", id)
        .order("date", { ascending: false }));
      return (data ?? []) as { id: string; date: string; amount: number; customer_name: string | null; created_at: string }[];
    },
  });

  const withQ = useQuery({
    queryKey: ["affiliate-withdrawals", id],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("withdrawals")
        .select("id,date,amount,currency,notes,created_at")
        .eq("affiliate_id", id)
        .order("date", { ascending: false }));
      return (data ?? []) as { id: string; date: string; amount: number; currency: string | null; notes: string | null; created_at: string }[];
    },
  });


  const expQ = useQuery({
    queryKey: ["affiliate-expenses", memberIds.join(",")],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("expenses")
        .select("id,date,amount,notes,created_at")
        .in("affiliate_id", memberIds)
        .order("date", { ascending: false }));
      return (data ?? []) as { id: string; date: string; amount: number; notes: string | null; created_at: string }[];
    },
  });

  // Payments to the affiliate, grouped into the settlement week they land in.
  // Anything dated before the charging start date is ignored entirely.
  const paidByWeek = useMemo(() => {
    const m = new Map<string, number>();
    if (!balanceOn) return m;
    for (const e of expQ.data ?? []) {
      if (balanceStart && e.date < balanceStart) continue;
      const k = weekStartOf(e.date);
      m.set(k, (m.get(k) ?? 0) + toDisplay(e.amount, (e as any).currency));
    }
    return m;
  }, [expQ.data, balanceOn, balanceStart]);

  // Lifetime ledger from the start date: the balance rolls forward week after
  // week, so a credit from a top-up is never lost when the date filter changes.
  const ledger = useMemo(() => {
    if (!members.length || !balanceOn) return [];
    const srcByName = new Map<string, string>();
    for (const s of srcQ.data ?? []) srcByName.set(s.name.trim().toLowerCase(), s.id);
    const lifetime = mergeWeekRows(
      members.map((m) => {
        const srcId = srcByName.get(m.name.trim().toLowerCase());
        const mine = (entriesQ.data ?? []).filter(
          (e) => e.source_id && e.source_id === srcId && (!balanceStart || e.entry_date >= balanceStart),
        );
        return weeklyGuarantee(m, mine);
      }),
    );
    return weeklyLedger(lifetime, paidByWeek, opening);
  }, [members, srcQ.data, entriesQ.data, balanceOn, balanceStart, paidByWeek, opening]);

  // Newest week first, so its closing balance is the live running balance.
  const runningBalance = ledger.length ? ledger[0].closing : balanceOn ? opening : 0;

  // Balance alert for this affiliate, plus the most recent week's cost so you
  // can judge how long the remaining credit lasts.
  const liveAlert = useMemo(
    () => (groupQ.data?.self ? balanceAlert(groupQ.data.self, runningBalance) : null),
    [groupQ.data, runningBalance],
  );
  const lastWeekCost = ledger.length ? ledger[0].cost : 0;

  const weeks = useMemo(
    () => ledger.filter((w) => inRange(w.weekStart) || inRange(w.weekEnd)),
    [ledger, activeRange],
  );
  const weekTotals = useMemo(() => sumWeeks(weeks), [weeks]);
  const paidInView = useMemo(() => weeks.reduce((s, w) => s + w.paid, 0), [weeks]);
  const { pageItems: weekPage, ...pgWeeks } = usePagination(weeks, 30);

  // Record a payment / top-up straight from the affiliate page.
  const [paying, setPaying] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", date: isoOf(new Date()), notes: "" });
  useEffect(() => {
    if (paying) setPayForm({ amount: "", date: isoOf(new Date()), notes: "" });
  }, [paying]);

  const savePayment = useMutation({
    mutationFn: async () => {
      const amount = Number(payForm.amount) || 0;
      if (amount <= 0) throw new Error("Enter an amount");
      const { error } = await supabase.from("expenses").insert({
        affiliate_id: id,
        amount,
        date: payForm.date,
        notes: payForm.notes.trim() || "Affiliate payout",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setPaying(false);
      qc.invalidateQueries({ queryKey: ["affiliate-expenses", memberIds.join(",")] });
      qc.invalidateQueries({ queryKey: ["expenses-list"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });



  const monthly = useMemo(() => {
    const baseCcy = getDisplayCurrency();
    const blank = () => ({ revenue: 0, withdrawals: 0, paid: 0 });
    const map = new Map<string, { revenue: number; withdrawals: number; paid: number }>();
    for (const r of (revQ.data ?? []).filter((x) => inRange(x.date))) {
      const k = monthKey(r.date);
      const m = map.get(k) ?? blank();
      m.revenue += toDisplay(r.amount, (r as any).currency);
      map.set(k, m);
    }
    for (const w of (withQ.data ?? []).filter((x) => inRange(x.date))) {
      const k = monthKey(w.date);
      const m = map.get(k) ?? blank();
      m.withdrawals += toDisplay(w.amount, w.currency);
      map.set(k, m);
    }
    for (const e of (expQ.data ?? []).filter((x) => inMoneyRange(x.date))) {
      const k = monthKey(e.date);
      const m = map.get(k) ?? blank();
      m.paid += toDisplay(e.amount, (e as any).currency);
      map.set(k, m);
    }
    return [...map.entries()]
      .map(([month, v]) => ({ month, ...v, net: affiliateNet(v) }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [revQ.data, withQ.data, expQ.data, activeRange]);

  const totals = useMemo(
    () => ({
      revenue: monthly.reduce((s, m) => s + m.revenue, 0),
      withdrawals: monthly.reduce((s, m) => s + m.withdrawals, 0),
      paid: monthly.reduce((s, m) => s + m.paid, 0),
      net: monthly.reduce((s, m) => s + m.net, 0),
    }),
    [monthly]
  );

  const { sorted, sort, toggle } = useSort(monthly, {
    month: (r) => r.month,
    revenue: (r) => r.revenue,
    withdrawals: (r) => r.withdrawals,
    paid: (r) => r.paid,
    net: (r) => r.net,
  });
  const { pageItems: monthlyPage, ...pgMonthly } = usePagination(sorted, 30);

  const transactions = useMemo(() => {
    const baseCcy = getDisplayCurrency();
    const withs = (withQ.data ?? []).filter((x) => inRange(x.date)).map((w) => ({ type: "Withdrawal" as const, date: w.date, amount: -toDisplay(w.amount, w.currency), label: w.notes || "Withdrawal", id: w.id }));
    const exps = (expQ.data ?? []).filter((x) => inMoneyRange(x.date)).map((e) => ({ type: "Paid to affiliate" as const, date: e.date, amount: -toDisplay(e.amount, (e as any).currency), label: e.notes || "Affiliate payout", id: e.id }));
    return [...withs, ...exps].sort((a, b) => b.date.localeCompare(a.date));
  }, [withQ.data, expQ.data, activeRange, balanceOn, balanceStart]);
  const { pageItems: txPage, ...pgTx } = usePagination(transactions, 30);

  const revenueMonthly = useMemo(() => {
    const map = new Map<string, { amount: number; deposits: number; clients: Set<string> }>();
    for (const r of (revQ.data ?? []).filter((x) => inRange(x.date))) {
      const k = monthKey(r.date);
      const m = map.get(k) ?? { amount: 0, deposits: 0, clients: new Set<string>() };
      m.amount += toDisplay(r.amount, (r as any).currency);
      m.deposits += 1;
      if (r.customer_name) m.clients.add(r.customer_name.trim().toLowerCase());
      map.set(k, m);
    }
    return [...map.entries()]
      .map(([month, v]) => ({ month, amount: v.amount, deposits: v.deposits, clients: v.clients.size }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [revQ.data, activeRange]);
  const { pageItems: revMonthPage, ...pgRevMonth } = usePagination(revenueMonthly, 30);


  return (
    <div>
      <div className="mb-4">
        <Link to="/affiliates" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="h-3 w-3" /> Back to affiliates
        </Link>
      </div>
      <PageHeader
        title={affQ.data?.name ?? "Affiliate"}
        description={
          members.length > 1
            ? `Billing group "${groupLabel}" — balance shared with ${members.filter((m) => m.id !== id).map((m) => m.name).join(" + ")}; revenue shown for this source only.`

            : affQ.data?.active
              ? "Monthly statement and transaction history."
              : "Inactive affiliate"
        }
        actions={
          <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (!weeks.length) return toast.error("Nothing to export");
              exportPDF(
                `Weekly guarantee — ${affQ.data?.name ?? "Affiliate"}`,
                [
                  ...weeks.map((w) => ({
                    Week: `${w.weekStart} → ${w.weekEnd}`,
                    Leads: w.leads,
                    Invalid: w.invalid,
                    Valid: w.valid,
                    FTDs: w.activated,
                    "Act %": w.activationPct == null ? "—" : `${w.activationPct}%`,
                    Reported: w.reported,
                    "Rep %": w.reportedPct == null ? "—" : `${w.reportedPct}%`,
                    Guaranteed: w.guaranteed,
                    Payable: w.payable,
                    Cost: fmtMoney(w.cost),
                    Shortfall: w.shortfall,
                  })),
                  {
                    Week: "TOTAL",
                    Leads: weekTotals.leads,
                    Invalid: weekTotals.invalid,
                    Valid: weekTotals.valid,
                    FTDs: weekTotals.activated,
                    "Act %": weekTotals.activationPct == null ? "—" : `${weekTotals.activationPct}%`,
                    Reported: weekTotals.reported,
                    "Rep %": weekTotals.reportedPct == null ? "—" : `${weekTotals.reportedPct}%`,
                    Guaranteed: weekTotals.guaranteed,
                    Payable: weekTotals.payable,
                    Cost: fmtMoney(weekTotals.cost),
                    Shortfall: weekTotals.shortfall,
                  },
                ],

                "affiliate-guarantee",
              );
            }}
          >
            <Download className="h-4 w-4" /> Guarantee PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!monthly.length) return toast.error("Nothing to export");
              exportPDF(
                `Payout statement — ${affQ.data?.name ?? "Affiliate"}`,
                [
                  ...monthly.map((r) => ({
                    Month: r.month,
                    Revenue: fmtMoney(r.revenue),
                    Withdrawals: fmtMoney(r.withdrawals),
                    Paid: fmtMoney(r.paid),
                    Net: fmtMoney(r.net),
                  })),
                  {
                    Month: "TOTAL",
                    Revenue: fmtMoney(totals.revenue),
                    Withdrawals: fmtMoney(totals.withdrawals),
                    Paid: fmtMoney(totals.paid),
                    Net: fmtMoney(totals.net),
                  },
                ],
                "affiliate-statement",
              );
            }}
          >
            <Download className="h-4 w-4" /> Statement PDF
          </Button>
          </div>
        }

      />

      <div className="mb-4">
        <DateRangePicker
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s2, e2) => { setCustomStart(s2); setCustomEnd(e2); }}
        />
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Revenue ({activeRange.label})</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtMoney(totals.revenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Withdrawals ({activeRange.label})</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-rose-500">{fmtMoney(totals.withdrawals)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Wallet className="h-4 w-4" /> Paid to affiliate ({activeRange.label})</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-500">{fmtMoney(totals.paid)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="h-4 w-4" /> Net ({activeRange.label})</CardTitle></CardHeader>
          <CardContent className={cn("text-2xl font-semibold", totals.net >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmtMoney(totals.net)}</CardContent>
        </Card>
      </section>

      {liveAlert && (
        <div
          className={cn(
            "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 text-sm",
            liveAlert.level === "credit-low"
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-rose-500/40 bg-rose-500/10",
          )}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Balance is close to zero</div>
              <div className="text-xs text-muted-foreground">
                {liveAlert.message} Alert threshold {fmtMoney(liveAlert.threshold)}
                {lastWeekCost ? ` · last week cost ${fmtMoney(lastWeekCost)}` : ""}.
              </div>
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setPaying(true)}>
              <Wallet className="h-3.5 w-3.5" /> Add payment
            </Button>
          )}
        </div>
      )}

      {!balanceOn ? (

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <span>Charging has not started for this affiliate, so no money is calculated.</span>
          {isAdmin && <Button size="sm" onClick={() => setActivating(true)}>Start charging</Button>}
        </div>
      ) : (
        isAdmin && (
          <div className="mb-4 flex flex-wrap justify-end gap-2">
            <Button size="sm" onClick={() => setPaying(true)}>
              <Wallet className="h-3.5 w-3.5" /> Add payment
            </Button>
            <Button variant="outline" size="sm" onClick={() => setActivating(true)}>
              Charging from {balanceStart}
            </Button>
          </div>
        )
      )}


      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Reported Cost ({activeRange.label})</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{balanceOn ? fmtMoney(weekTotals.cost) : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Paid ({activeRange.label})</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-500">{balanceOn ? fmtMoney(paidInView) : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">
            {runningBalance < 0 ? "Credit carried over" : "Balance outstanding"}
          </CardTitle></CardHeader>
          <CardContent className={cn("text-2xl font-semibold", runningBalance < 0 ? "text-emerald-500" : "text-rose-500")}>
            {balanceOn ? fmtMoney(Math.abs(runningBalance)) : "—"}
          </CardContent>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {!balanceOn
              ? "Charging not started"
              : `Running total, rolls over week to week${balanceStart ? ` · since ${balanceStart}` : ""}${
                  opening ? ` · includes ${fmtMoney(Math.abs(opening))} opening ${opening < 0 ? "credit" : "debt"}` : ""
                }`}
          </CardContent>
        </Card>



        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Guarantee delivery</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {deliveryPct(weekTotals) == null ? "—" : `${deliveryPct(weekTotals)}%`}
          </CardContent>
        </Card>
      </section>




      <div className="card-surface overflow-hidden mb-6">
        <div className="p-4 border-b border-border">
          <h3 className="font-display text-base font-semibold">
            {members.length > 1
              ? "Weekly settlement (billing group)"
              : Number(affQ.data?.guarantee_value || 0) > 0
                ? "Weekly conversion guarantee"
                : "Weekly settlement (flat)"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {members
              .map(
                (m) =>
                  `${m.name}: ${fmtMoney(Number(m.cpa_rate || 0))} per conversion · ${
                    Number(m.guarantee_value || 0) > 0
                      ? `${Number(m.guarantee_value)}% guaranteed`
                      : "flat, no guarantee"
                  }`,
              )
              .join(" — ")}
            . Each Mon–Sun week settles on its own; with a guarantee, conversions above it are free.
          </p>

        </div>
        {weeks.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No lead entries in this period.</div>
        ) : (
          <>
          <TableCountBar {...pgWeeks} />
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Week</th>
                  <th className="py-3 px-4">Leads</th>
                  <th className="py-3 px-4">Valid</th>
                  <th className="py-3 px-4">FTDs</th>
                  <th className="py-3 px-4">Act %</th>
                  <th className="py-3 px-4">Reported</th>
                  <th className="py-3 px-4">Rep %</th>
                  <th className="py-3 px-4">Guaranteed</th>
                  <th className="py-3 px-4">Payable</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Shortfall</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Balance</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {weekPage.map((w) => (
                  <tr key={w.weekStart} className="border-b border-border/50 transition-colors hover:bg-accent/30">
                    <td className="py-3 px-4 font-medium whitespace-nowrap">{w.weekStart} → {w.weekEnd}</td>
                    <td className="py-3 px-4">{w.leads}{w.invalid ? <span className="text-muted-foreground"> (−{w.invalid})</span> : null}</td>
                    <td className="py-3 px-4">{w.valid}</td>
                    <td className="py-3 px-4">{w.activated}</td>
                    <td className="py-3 px-4">{w.activationPct == null ? "—" : `${w.activationPct}%`}</td>
                    <td className="py-3 px-4">{w.reported}</td>
                    <td className="py-3 px-4">{w.reportedPct == null ? "—" : `${w.reportedPct}%`}</td>
                    <td className="py-3 px-4">{w.guaranteed}</td>
                    <td className="py-3 px-4">{w.payable}</td>
                    <td className="py-3 px-4">{fmtMoney(w.cost)}</td>
                    <td className="py-3 px-4 text-rose-500">{w.shortfall || "—"}</td>
                    <td className="py-3 px-4 text-amber-500">{w.paid ? `−${fmtMoney(w.paid)}` : "—"}</td>
                    <td className={cn("py-3 px-4 font-medium", w.closing < 0 ? "text-emerald-500" : "text-rose-500")}>
                      {w.closing < 0 ? `${fmtMoney(Math.abs(w.closing))} cr` : fmtMoney(w.closing)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        "rounded border px-1.5 py-0.5 text-xs font-medium",
                        w.status === "over" ? "border-emerald-500/30 text-emerald-500" :
                        w.status === "short" ? "border-rose-500/30 text-rose-500" :
                        "border-border text-muted-foreground",
                      )}>
                        {w.status === "over" ? "Over" : w.status === "short" ? "Short" : "Met"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="py-3 px-4">Total</td>
                  <td className="py-3 px-4">{weekTotals.leads}</td>
                  <td className="py-3 px-4">{weekTotals.valid}</td>
                  <td className="py-3 px-4">{weekTotals.activated}</td>
                  <td className="py-3 px-4">{weekTotals.activationPct == null ? "—" : `${weekTotals.activationPct}%`}</td>
                  <td className="py-3 px-4">{weekTotals.reported}</td>
                  <td className="py-3 px-4">{weekTotals.reportedPct == null ? "—" : `${weekTotals.reportedPct}%`}</td>
                  <td className="py-3 px-4">{weekTotals.guaranteed}</td>
                  <td className="py-3 px-4">{weekTotals.payable}</td>
                  <td className="py-3 px-4">{fmtMoney(weekTotals.cost)}</td>
                  <td className="py-3 px-4 text-rose-500">{weekTotals.shortfall || "—"}</td>
                  <td className="py-3 px-4 text-amber-500">{paidInView ? `−${fmtMoney(paidInView)}` : "—"}</td>
                  <td className={cn("py-3 px-4", runningBalance < 0 ? "text-emerald-500" : "text-rose-500")}>
                    {runningBalance < 0 ? `${fmtMoney(Math.abs(runningBalance))} cr` : fmtMoney(runningBalance)}
                  </td>
                  <td className="py-3 px-4"></td>
                </tr>
              </tfoot>

            </table>
          </div>
          <TablePagination {...pgWeeks} />
          </>
        )}
      </div>

      <div className="card-surface overflow-hidden mb-6">
        <div className="p-4 border-b border-border">
          <h3 className="font-display text-base font-semibold">Revenue by month</h3>
          <p className="text-xs text-muted-foreground mt-1">Deposits from clients attributed to this affiliate.</p>
        </div>
        {revenueMonthly.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No revenue in this period.</div>
        ) : (
          <>
          <TableCountBar {...pgRevMonth} />
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-3 px-4">Month</th>
                  <th className="py-3 px-4">Deposits</th>
                  <th className="py-3 px-4">Clients</th>
                  <th className="py-3 px-4">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {revMonthPage.map((m) => (
                  <tr key={m.month} className="border-b border-border/50 transition-colors hover:bg-accent/30">
                    <td className="py-3 px-4 font-medium">{m.month}</td>
                    <td className="py-3 px-4">{m.deposits}</td>
                    <td className="py-3 px-4">{m.clients}</td>
                    <td className="py-3 px-4 font-medium text-emerald-500">{fmtMoney(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="py-3 px-4">Total</td>
                  <td className="py-3 px-4">{revenueMonthly.reduce((s, m) => s + m.deposits, 0)}</td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4 text-emerald-500">{fmtMoney(totals.revenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <TablePagination {...pgRevMonth} />
          </>
        )}
      </div>


      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-surface overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-display text-base font-semibold">Monthly breakdown</h3>
          </div>
          {sorted.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">No transactions yet.</div>
          ) : (
            <TableCountBar {...pgMonthly} />
            <div className="overflow-x-auto scroll-slim">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <SortTh label="Month" k="month" sort={sort} toggle={toggle} />
                    <SortTh label="Revenue" k="revenue" sort={sort} toggle={toggle} />
                    <SortTh label="Withdrawals" k="withdrawals" sort={sort} toggle={toggle} />
                    <SortTh label="Paid" k="paid" sort={sort} toggle={toggle} />
                    <SortTh label="Net" k="net" sort={sort} toggle={toggle} />
                  </tr>
                </thead>
                <tbody>
                  {monthlyPage.map((r) => (
                    <tr key={r.month} className="border-b border-border/50 transition-colors hover:bg-accent/30">
                      <td className="py-3 px-4 font-medium">{r.month}</td>
                      <td className="py-3 px-4">{fmtMoney(r.revenue)}</td>
                      <td className="py-3 px-4 text-rose-500">−{fmtMoney(r.withdrawals)}</td>
                      <td className="py-3 px-4 text-amber-500">−{fmtMoney(r.paid)}</td>
                      <td className={cn("py-3 px-4 font-medium", r.net >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmtMoney(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <TablePagination {...pgMonthly} />
        </div>

        <div className="card-surface overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-display text-base font-semibold">Recent transactions</h3>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">No transactions yet.</div>
          ) : (
            <div className="overflow-auto scroll-slim max-h-[420px]">
              <TableCountBar {...pgTx} />
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {txPage.map((t) => (
                    <tr key={`${t.type}-${t.id}`} className="border-b border-border/50 transition-colors hover:bg-accent/30">
                      <td className="py-3 px-4">{t.date}</td>
                      <td className="py-3 px-4">
                        <span className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", t.type === "Paid to affiliate" ? "border-amber-500/30 text-amber-500" : "border-rose-500/30 text-rose-500")}>{t.type}</span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{t.label}</td>
                      <td className={cn("py-3 px-4 font-medium", t.amount >= 0 ? "text-emerald-500" : "text-rose-500")}>{t.amount >= 0 ? "" : "−"}{fmtMoney(Math.abs(t.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <TablePagination {...pgTx} />
        </div>
      </div>

      <Dialog open={activating} onOpenChange={setActivating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start charging from — {affQ.data?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Start charging from</Label>
              <Input type="date" value={actForm.start} onChange={(e) => setActForm((f) => ({ ...f, start: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Weeks and payments before this date are ignored completely — no old debt, no old top-ups. The balance builds up from this date and rolls forward week to week.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Starting balance</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={actForm.opening}
                onChange={(e) => setActForm((f) => ({ ...f, opening: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Where the balance opens on that date. Positive = you owe the affiliate; negative (e.g. −4000) = credit, eaten by the coming weeks before you owe again. Leave empty to start clean.
              </p>
              {Number(actForm.opening) !== 0 && actForm.opening !== "" && (
                <p className="text-xs text-muted-foreground">
                  Starts at {fmtMoney(Math.abs(Number(actForm.opening)))} {Number(actForm.opening) < 0 ? "credit" : "owed"}
                  {actForm.start ? ` on ${actForm.start}` : ""}.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Alert me when balance is within</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 2000"
                value={actForm.threshold}
                onChange={(e) => setActForm((f) => ({ ...f, threshold: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                You get an alert once the balance sits between −{fmtMoney(Number(actForm.threshold) || 0)} and {fmtMoney(Number(actForm.threshold) || 0)} — credit nearly used up, or debt building back up. Leave empty for no alerts.
              </p>
            </div>
            {groupLabel && (
              <p className="text-xs text-muted-foreground">
                Applies to every affiliate in billing group “{groupLabel}”, since they share one balance.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {balanceOn ? (
              <Button variant="ghost" className="text-destructive" onClick={() => saveActivation.mutate("off")} disabled={saveActivation.isPending}>
                Turn off tracking
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setActivating(false)}>Cancel</Button>
              <Button onClick={() => saveActivation.mutate("on")} disabled={saveActivation.isPending || !actForm.start}>
                {balanceOn ? "Save" : "Start"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add payment — {affQ.data?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} />
              {balanceStart && payForm.date && payForm.date < balanceStart && (
                <p className="text-xs text-amber-500">This date is before charging started ({balanceStart}), so it will not count toward the balance.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} placeholder="wire 19/08" />
            </div>
            <p className="text-xs text-muted-foreground">Any credit left over rolls into the next week automatically.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaying(false)}>Cancel</Button>
            <Button onClick={() => savePayment.mutate()} disabled={savePayment.isPending || !payForm.amount || !payForm.date}>
              Save payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
