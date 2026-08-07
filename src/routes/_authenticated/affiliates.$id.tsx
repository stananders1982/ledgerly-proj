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
import { deliveryPct, sumWeeks, weeklyGuarantee, type LeadEntryLike } from "@/lib/affiliate-balance";


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

  const affQ = useQuery({
    queryKey: ["affiliate", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliates")
        .select("id,name,active,cpa_rate,guarantee_value")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; active: boolean; cpa_rate: number; guarantee_value: number };
    },
  });

  const srcQ = useQuery({
    queryKey: ["affiliate-sources-one", affQ.data?.name],
    enabled: !!affQ.data?.name,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_sources").select("id,name");
      if (error) throw error;
      return ((data ?? []) as { id: string; name: string }[]).filter(
        (s) => s.name.trim().toLowerCase() === affQ.data!.name.trim().toLowerCase(),
      );
    },
  });

  const entriesQ = useQuery({
    queryKey: ["affiliate-entries-one", id],
    queryFn: async () => {
      const data = await fetchAll(() =>
        supabase.from("daily_lead_entries").select("entry_date,received,reported,source_id"),
      );
      return (data ?? []) as LeadEntryLike[];
    },
  });

  const weeks = useMemo(() => {
    if (!affQ.data) return [];
    const ids = new Set((srcQ.data ?? []).map((s) => s.id));
    const mine = (entriesQ.data ?? []).filter(
      (e) => e.source_id && ids.has(e.source_id) && inRange(e.entry_date),
    );
    return weeklyGuarantee(affQ.data, mine);
  }, [affQ.data, srcQ.data, entriesQ.data, activeRange]);

  const weekTotals = useMemo(() => sumWeeks(weeks), [weeks]);
  const { pageItems: weekPage, ...pgWeeks } = usePagination(weeks, 30);


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
    queryKey: ["affiliate-expenses", id],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("expenses")
        .select("id,date,amount,notes,created_at")
        .eq("affiliate_id", id)
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
    for (const e of (expQ.data ?? []).filter((x) => inRange(x.date))) {
      const k = monthKey(e.date);
      const m = map.get(k) ?? blank();
      m.paid += Number(e.amount || 0);
      map.set(k, m);
    }
    return [...map.entries()]
      .map(([month, v]) => ({ month, ...v, net: v.revenue - v.withdrawals - v.paid }))
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
    const rev = (revQ.data ?? []).filter((x) => inRange(x.date)).map((r) => ({ type: "Revenue" as const, date: r.date, amount: Number(r.amount || 0), label: r.customer_name || "Revenue", id: r.id }));
    const withs = (withQ.data ?? []).filter((x) => inRange(x.date)).map((w) => ({ type: "Withdrawal" as const, date: w.date, amount: -Number(w.amount || 0), label: w.notes || "Withdrawal", id: w.id }));
    const exps = (expQ.data ?? []).filter((x) => inRange(x.date)).map((e) => ({ type: "Paid to affiliate" as const, date: e.date, amount: -Number(e.amount || 0), label: e.notes || "Affiliate payout", id: e.id }));
    return [...rev, ...withs, ...exps].sort((a, b) => b.date.localeCompare(a.date));
  }, [revQ.data, withQ.data, expQ.data, activeRange]);
  const { pageItems: txPage, ...pgTx } = usePagination(transactions, 30);

  return (
    <div>
      <div className="mb-4">
        <Link to="/affiliates" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="h-3 w-3" /> Back to affiliates
        </Link>
      </div>
      <PageHeader
        title={affQ.data?.name ?? "Affiliate"}
        description={affQ.data?.active ? "Monthly statement and transaction history." : "Inactive affiliate"}
        actions={
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

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
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
                        <span className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", t.type === "Revenue" ? "border-emerald-500/30 text-emerald-500" : t.type === "Paid to affiliate" ? "border-amber-500/30 text-amber-500" : "border-rose-500/30 text-rose-500")}>{t.type}</span>
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
