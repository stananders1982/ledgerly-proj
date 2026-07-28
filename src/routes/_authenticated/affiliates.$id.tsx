import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Calendar, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSort, SortTh } from "@/components/sortable-table";

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
  const { id } = useParams({ from: "/_authenticated/affiliates/$id" });
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const affQ = useQuery({
    queryKey: ["affiliate", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("affiliates").select("id,name,active").eq("id", id).single();
      if (error) throw error;
      return data as { id: string; name: string; active: boolean };
    },
  });

  const revQ = useQuery({
    queryKey: ["affiliate-revenue", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue")
        .select("id,date,amount,customer_name,created_at")
        .eq("affiliate_id", id)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; date: string; amount: number; customer_name: string | null; created_at: string }[];
    },
  });

  const withQ = useQuery({
    queryKey: ["affiliate-withdrawals", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawals")
        .select("id,date,amount,notes,created_at")
        .eq("affiliate_id", id)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; date: string; amount: number; notes: string | null; created_at: string }[];
    },
  });

  const monthly = useMemo(() => {
    const map = new Map<string, { revenue: number; withdrawals: number }>();
    for (const r of revQ.data ?? []) {
      const k = monthKey(r.date);
      const m = map.get(k) ?? { revenue: 0, withdrawals: 0 };
      m.revenue += Number(r.amount || 0);
      map.set(k, m);
    }
    for (const w of withQ.data ?? []) {
      const k = monthKey(w.date);
      const m = map.get(k) ?? { revenue: 0, withdrawals: 0 };
      m.withdrawals += Number(w.amount || 0);
      map.set(k, m);
    }
    return [...map.entries()]
      .map(([month, v]) => ({ month, ...v, net: v.revenue - v.withdrawals }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [revQ.data, withQ.data]);

  const filteredMonth = monthly.find((m) => m.month === month);

  const totals = useMemo(
    () => ({
      revenue: monthly.reduce((s, m) => s + m.revenue, 0),
      withdrawals: monthly.reduce((s, m) => s + m.withdrawals, 0),
      net: monthly.reduce((s, m) => s + m.net, 0),
    }),
    [monthly]
  );

  const { sorted, sort, toggle } = useSort(monthly, {
    month: (r) => r.month,
    revenue: (r) => r.revenue,
    withdrawals: (r) => r.withdrawals,
    net: (r) => r.net,
  });

  const transactions = useMemo(() => {
    const rev = (revQ.data ?? []).map((r) => ({ type: "Revenue" as const, date: r.date, amount: Number(r.amount || 0), label: r.customer_name || "Revenue", id: r.id }));
    const withs = (withQ.data ?? []).map((w) => ({ type: "Withdrawal" as const, date: w.date, amount: -Number(w.amount || 0), label: w.notes || "Withdrawal", id: w.id }));
    return [...rev, ...withs].sort((a, b) => b.date.localeCompare(a.date));
  }, [revQ.data, withQ.data]);

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
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
          </div>
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Total revenue</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtMoney(totals.revenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total withdrawals</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-rose-500">{fmtMoney(totals.withdrawals)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="h-4 w-4" /> Net balance</CardTitle></CardHeader>
          <CardContent className={cn("text-2xl font-semibold", totals.net >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmtMoney(totals.net)}</CardContent>
        </Card>
      </section>

      {filteredMonth && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4" /> {month} revenue</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{fmtMoney(filteredMonth.revenue)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{month} withdrawals</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold text-rose-500">{fmtMoney(filteredMonth.withdrawals)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{month} net</CardTitle></CardHeader>
            <CardContent className={cn("text-2xl font-semibold", filteredMonth.net >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmtMoney(filteredMonth.net)}</CardContent>
          </Card>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-surface overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-display text-base font-semibold">Monthly breakdown</h3>
          </div>
          {sorted.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">No transactions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <SortTh label="Month" k="month" sort={sort} toggle={toggle} />
                    <SortTh label="Revenue" k="revenue" sort={sort} toggle={toggle} />
                    <SortTh label="Withdrawals" k="withdrawals" sort={sort} toggle={toggle} />
                    <SortTh label="Net" k="net" sort={sort} toggle={toggle} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.month} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="py-3 px-4 font-medium">{r.month}</td>
                      <td className="py-3 px-4">{fmtMoney(r.revenue)}</td>
                      <td className="py-3 px-4 text-rose-500">−{fmtMoney(r.withdrawals)}</td>
                      <td className={cn("py-3 px-4 font-medium", r.net >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmtMoney(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card-surface overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-display text-base font-semibold">Recent transactions</h3>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">No transactions yet.</div>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 50).map((t) => (
                    <tr key={`${t.type}-${t.id}`} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="py-3 px-4">{t.date}</td>
                      <td className="py-3 px-4">
                        <span className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", t.type === "Revenue" ? "border-emerald-500/30 text-emerald-500" : "border-rose-500/30 text-rose-500")}>{t.type}</span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{t.label}</td>
                      <td className={cn("py-3 px-4 font-medium", t.amount >= 0 ? "text-emerald-500" : "text-rose-500")}>{t.amount >= 0 ? "" : "−"}{fmtMoney(Math.abs(t.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
