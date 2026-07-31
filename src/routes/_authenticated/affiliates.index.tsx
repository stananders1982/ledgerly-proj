import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/affiliates/")({
  head: () => ({
    meta: [
      { title: "Affiliates — Ledgerly" },
      { name: "description", content: "Affiliate directory with revenue, withdrawals and net balance." },
      { property: "og:title", content: "Affiliates — Ledgerly" },
      { property: "og:description", content: "Affiliate directory with revenue, withdrawals and net balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AffiliatesPage,
});

function AffiliatesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const affQ = useQuery({
    queryKey: ["affiliates-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("affiliates").select("id,name,active").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean }[];
    },
  });

  const revQ = useQuery({
    queryKey: ["affiliates-revenue-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("revenue").select("affiliate_id,amount").not("affiliate_id", "is", null);
      if (error) throw error;
      return (data ?? []) as { affiliate_id: string; amount: number }[];
    },
  });

  const withQ = useQuery({
    queryKey: ["affiliates-withdrawals-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("withdrawals").select("affiliate_id,amount").not("affiliate_id", "is", null);
      if (error) throw error;
      return (data ?? []) as { affiliate_id: string; amount: number }[];
    },
  });

  const expQ = useQuery({
    queryKey: ["affiliates-expenses-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("affiliate_id,amount").not("affiliate_id", "is", null);
      if (error) throw error;
      return (data ?? []) as { affiliate_id: string; amount: number }[];
    },
  });

  const rows = useMemo(() => {
    const revenueByAff = new Map<string, number>();
    for (const r of revQ.data ?? []) {
      revenueByAff.set(r.affiliate_id, (revenueByAff.get(r.affiliate_id) ?? 0) + Number(r.amount || 0));
    }
    const withByAff = new Map<string, number>();
    for (const w of withQ.data ?? []) {
      withByAff.set(w.affiliate_id, (withByAff.get(w.affiliate_id) ?? 0) + Number(w.amount || 0));
    }

    const paidByAff = new Map<string, number>();
    for (const e of expQ.data ?? []) {
      paidByAff.set(e.affiliate_id, (paidByAff.get(e.affiliate_id) ?? 0) + Number(e.amount || 0));
    }

    return (affQ.data ?? [])
      .map((a) => {
        const revenue = revenueByAff.get(a.id) ?? 0;
        const withdrawn = withByAff.get(a.id) ?? 0;
        const paid = paidByAff.get(a.id) ?? 0;
        return {
          id: a.id,
          name: a.name,
          active: a.active,
          revenue,
          withdrawn,
          paid,
          net: revenue - withdrawn - paid,
        };
      })
      .filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [affQ.data, revQ.data, withQ.data, expQ.data, search]);

  const { sorted, sort, toggle } = useSort(rows, {
    name: (r) => r.name,
    revenue: (r) => r.revenue,
    withdrawn: (r) => r.withdrawn,
    paid: (r) => r.paid,
    net: (r) => r.net,
  });
  const { pageItems, ...pg } = usePagination(sorted, 30);

  const totals = useMemo(
    () => ({
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      withdrawn: rows.reduce((s, r) => s + r.withdrawn, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
    }),
    [rows]
  );

  return (
    <div>
      <PageHeader
        title="Affiliates"
        description="Directory of affiliates with lifetime revenue, withdrawals and net balance."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Search affiliates…" className="w-56" />}
      />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Total revenue</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtMoney(totals.revenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total withdrawals</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-rose-500">{fmtMoney(totals.withdrawn)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Wallet className="h-4 w-4" /> Paid to affiliates</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-500">{fmtMoney(totals.paid)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="h-4 w-4" /> Net balance</CardTitle></CardHeader>
          <CardContent className={cn("text-2xl font-semibold", totals.net >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmtMoney(totals.net)}</CardContent>
        </Card>
      </section>

      <div className="card-surface overflow-hidden">
        {sorted.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">
            {search ? "No affiliates match." : <EmptyState icon={Building2} title="No affiliates yet" description="Add affiliates through Lead Sources or the admin panel." />}
          </div>
        ) : (
          <>
          <DataCardList>
            {pageItems.map((r) => (
              <DataCard
                key={r.id}
                title={r.name}
                subtitle={r.active ? undefined : "Inactive"}
                fields={[
                  { label: "Revenue", value: <span className="num">{fmtMoney(r.revenue)}</span> },
                  { label: "Withdrawals", value: <span className="num text-destructive">−{fmtMoney(r.withdrawn)}</span> },
                  { label: "Paid", value: <span className="num text-warning">−{fmtMoney(r.paid)}</span> },
                  { label: "Net", value: <span className={cn("num font-medium", r.net >= 0 ? "text-success" : "text-destructive")}>{fmtMoney(r.net)}</span> },
                ]}
                actions={<Link to="/affiliates/$id" params={{ id: r.id }} className="text-primary hover:underline text-xs">Statement</Link>}
              />
            ))}
          </DataCardList>
          <div className="hidden md:block overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <SortTh label="Affiliate" k="name" sort={sort} toggle={toggle} />
                  <SortTh label="Revenue" k="revenue" sort={sort} toggle={toggle} />
                  <SortTh label="Withdrawals" k="withdrawn" sort={sort} toggle={toggle} />
                  <SortTh label="Paid" k="paid" sort={sort} toggle={toggle} />
                  <SortTh label="Net" k="net" sort={sort} toggle={toggle} />
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                    onClick={() => navigate({ to: "/affiliates/$id", params: { id: r.id } })}
                  >
                    <td className="py-3 px-4 font-medium">
                      {r.name}
                      {!r.active && <span className="ml-2 text-xs text-muted-foreground">inactive</span>}
                    </td>
                    <td className="py-3 px-4">{fmtMoney(r.revenue)}</td>
                    <td className="py-3 px-4 text-rose-500">−{fmtMoney(r.withdrawn)}</td>
                    <td className="py-3 px-4 text-amber-500">−{fmtMoney(r.paid)}</td>
                    <td className={cn("py-3 px-4 font-medium", r.net >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmtMoney(r.net)}</td>
                    <td className="py-3 px-4 text-right">
                      <Link to="/affiliates/$id" params={{ id: r.id }} className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                        Statement <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pg} />
          </>
        )}
      </div>
    </div>
  );
}
