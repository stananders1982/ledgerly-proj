import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, TrendingUp, Wallet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useExporters } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/format";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { cn } from "@/lib/utils";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";
import { deliveryPct, sumWeeks, weeklyGuarantee, mergeWeekRows, affiliateNet, balanceActive, openingBalance, type LeadEntryLike, type WeekRow } from "@/lib/affiliate-balance";

type AffRow = { id: string; name: string; active: boolean; cpa_rate: number; guarantee_value: number; group_key: string | null; balance_start_date: string | null; opening_balance: number | null; balance_activated_at: string | null };


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

function AffiliateStatementPage() {
  const { exportPDF } = useExporters();
  const { id } = useParams({ from: "/_authenticated/affiliates/$id" });
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const activeRange = useMemo(
    () => getRange(range, { start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );
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
        .select("id,name,active,cpa_rate,guarantee_value,group_key,balance_start_date,opening_balance,balance_activated_at")
        .eq("id", id)
        .single();
      if (error) throw error;
      const self = data as AffRow;
      if (!self.group_key?.trim()) return { self, members: [self] };
      const { data: rest, error: e2 } = await supabase
        .from("affiliates")
        .select("id,name,active,cpa_rate,guarantee_value,group_key,balance_start_date,opening_balance,balance_activated_at")
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

  // Money only counts from the day the balance was activated — the app took over
  // part-way through the year, so earlier weeks and payouts are never re-derived.
  const balanceOn = balanceActive(groupQ.data?.self);
  const balanceStart = groupQ.data?.self?.balance_start_date ?? null;
  const opening = openingBalance(groupQ.data?.self);
  const inMoneyRange = (d: string) =>
    balanceOn && inRange(d) && (!balanceStart || d >= balanceStart);

  const weeks = useMemo(() => {
    if (!members.length || !balanceOn) return [];
    const srcByName = new Map<string, string>();
    for (const s of srcQ.data ?? []) srcByName.set(s.name.trim().toLowerCase(), s.id);
    // Each member settles on its own terms; weeks are then merged for the group.
    return mergeWeekRows(
      members.map((m) => {
        const srcId = srcByName.get(m.name.trim().toLowerCase());
        const mine = (entriesQ.data ?? []).filter(
          (e) => e.source_id && e.source_id === srcId && inMoneyRange(e.entry_date),
        );
        return weeklyGuarantee(m, mine);
      }),
    );
  }, [members, srcQ.data, entriesQ.data, activeRange, balanceOn, balanceStart]);

  const weekTotals = useMemo(() => sumWeeks(weeks), [weeks]);
  const { pageItems: weekPage, ...pgWeeks } = usePagination(weeks, 30);


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
        .select("id,date,amount,notes,created_at")
        .eq("affiliate_id", id)
        .order("date", { ascending: false }));
      return (data ?? []) as { id: string; date: string; amount: number; notes: string | null; created_at: string }[];
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

  const monthly = useMemo(() => {
    const blank = () => ({ revenue: 0, withdrawals: 0, paid: 0 });
    const map = new Map<string, { revenue: number; withdrawals: number; paid: number }>();
    for (const r of (revQ.data ?? []).filter((x) => inRange(x.date))) {
      const k = monthKey(r.date);
      const m = map.get(k) ?? blank();
      m.revenue += Number(r.amount || 0);
      map.set(k, m);
    }
    for (const w of (withQ.data ?? []).filter((x) => inRange(x.date))) {
      const k = monthKey(w.date);
      const m = map.get(k) ?? blank();
      m.withdrawals += Number(w.amount || 0);
      map.set(k, m);
    }
    for (const e of (expQ.data ?? []).filter((x) => inMoneyRange(x.date))) {
      const k = monthKey(e.date);
      const m = map.get(k) ?? blank();
      m.paid += Number(e.amount || 0);
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
    const withs = (withQ.data ?? []).filter((x) => inRange(x.date)).map((w) => ({ type: "Withdrawal" as const, date: w.date, amount: -Number(w.amount || 0), label: w.notes || "Withdrawal", id: w.id }));
    const exps = (expQ.data ?? []).filter((x) => inMoneyRange(x.date)).map((e) => ({ type: "Paid to affiliate" as const, date: e.date, amount: -Number(e.amount || 0), label: e.notes || "Affiliate payout", id: e.id }));
    return [...withs, ...exps].sort((a, b) => b.date.localeCompare(a.date));
  }, [withQ.data, expQ.data, activeRange, balanceOn, balanceStart]);
  const { pageItems: txPage, ...pgTx } = usePagination(transactions, 30);

  const revenueMonthly = useMemo(() => {
    const map = new Map<string, { amount: number; deposits: number; clients: Set<string> }>();
    for (const r of (revQ.data ?? []).filter((x) => inRange(x.date))) {
      const k = monthKey(r.date);
      const m = map.get(k) ?? { amount: 0, deposits: 0, clients: new Set<string>() };
      m.amount += Number(r.amount || 0);
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

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Reported Cost ({activeRange.label})</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtMoney(weekTotals.cost)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Paid to affiliate</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-500">{fmtMoney(totals.paid)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">
            {totals.paid > weekTotals.cost ? "Credit with affiliate" : "Balance outstanding"}
          </CardTitle></CardHeader>
          <CardContent className={cn("text-2xl font-semibold", totals.paid > weekTotals.cost ? "text-emerald-500" : "text-rose-500")}>
            {fmtMoney(Math.abs(weekTotals.cost - totals.paid))}
          </CardContent>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {totals.paid > weekTotals.cost ? "Paid ahead of reported cost" : "Still owed to the affiliate"}
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
    </div>
  );
}
