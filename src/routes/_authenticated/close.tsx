import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { TableFrame } from "@/components/table-frame";
import { TableSkeleton } from "@/components/table-skeleton";
import { QueryError } from "@/components/query-error";
import { StatCard } from "@/components/stat-card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtDate, fmtMoney } from "@/lib/format";
import { toDisplay } from "@/lib/fx";
import { feeTotals } from "@/lib/profitability";
import { useCompanySettings } from "@/lib/settings";
import {
  usePeriodCloses, monthKey, monthLabel, monthRange, isMonthClosed, PERIOD_CLOSES_KEY,
} from "@/lib/period-close";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/close")({
  component: MonthlyClosePage,
  head: () => ({
    meta: [
      { title: "Monthly close | Ledgerly" },
      { name: "description", content: "Reconcile deposits and lock finished months so past books cannot change." },
      { property: "og:title", content: "Monthly close | Ledgerly" },
      { property: "og:description", content: "Reconcile deposits and lock finished months so past books cannot change." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type MonthRow = {
  month: string;
  revenue: number;
  fees: number;
  net: number;
  expenses: number;
  withdrawals: number;
  deposits: number;
  reconciled: number;
  closed: boolean;
};

function MonthlyClosePage() {
  const qc = useQueryClient();
  const { isAdmin, user } = useAuth();
  const settings = useCompanySettings();
  const [pending, setPending] = useState<{ month: string; close: boolean } | null>(null);
  const [notes, setNotes] = useState("");

  const closesQ = usePeriodCloses();

  const dataQ = useQuery({
    queryKey: ["close-data"],
    queryFn: async () => {
      const [rev, exp, wd] = await Promise.all([
        fetchAll<any>(() => supabase.from("revenue").select("id,amount,currency,date,method,fee_pct,fee_amount,reconciled_at")),
        fetchAll<any>(() => supabase.from("expenses").select("amount,currency,date")),
        fetchAll<any>(() => supabase.from("withdrawals").select("amount,currency,date,status")),
      ]);
      return { rev, exp, wd };
    },
  });

  const rows = useMemo<MonthRow[]>(() => {
    const d = dataQ.data;
    if (!d) return [];
    const earliest = [...d.rev, ...d.exp, ...d.wd]
      .map((r: any) => String(r.date ?? ""))
      .filter(Boolean)
      .sort()[0] ?? null;

    const months = monthRange(earliest);
    const byMonth = new Map<string, MonthRow>();
    for (const m of months) {
      byMonth.set(m, {
        month: m, revenue: 0, fees: 0, net: 0, expenses: 0, withdrawals: 0,
        deposits: 0, reconciled: 0, closed: isMonthClosed(m, closesQ.data),
      });
    }

    const revByMonth = new Map<string, any[]>();
    for (const r of d.rev) {
      const m = monthKey(String(r.date));
      if (!byMonth.has(m)) continue;
      (revByMonth.get(m) ?? revByMonth.set(m, []).get(m)!).push(r);
    }
    for (const [m, list] of revByMonth) {
      const row = byMonth.get(m)!;
      const t = feeTotals(list, settings);
      row.revenue = t.gross;
      row.fees = t.fees;
      row.net = t.net;
      row.deposits = list.length;
      row.reconciled = list.filter((r) => !!r.reconciled_at).length;
    }
    for (const e of d.exp) {
      const row = byMonth.get(monthKey(String(e.date)));
      if (row) row.expenses += toDisplay(e.amount, e.currency);
    }
    for (const w of d.wd) {
      if (String(w.status ?? "paid") === "rejected") continue;
      const row = byMonth.get(monthKey(String(w.date)));
      if (row) row.withdrawals += toDisplay(w.amount, w.currency);
    }
    return months.map((m) => byMonth.get(m)!);
  }, [dataQ.data, closesQ.data, settings]);

  const summary = useMemo(() => {
    const closed = rows.filter((r) => r.closed).length;
    const openMonths = rows.filter((r) => !r.closed);
    const unreconciled = openMonths.reduce((s, r) => s + (r.deposits - r.reconciled), 0);
    return { closed, open: openMonths.length, unreconciled };
  }, [rows]);

  const toggle = useMutation({
    mutationFn: async ({ month, close }: { month: string; close: boolean }) => {
      if (close) {
        const { error } = await sb.from("period_closes").insert({
          period_month: month,
          user_email: user?.email ?? null,
          closed_by: user?.id ?? null,
          notes: notes || null,
        });
        if (error) throw error;
      } else {
        const { error } = await sb.from("period_closes").delete().eq("period_month", month);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: PERIOD_CLOSES_KEY });
      toast.success(v.close ? `${monthLabel(v.month)} locked` : `${monthLabel(v.month)} reopened`);
      setPending(null);
      setNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reconcileMonth = useMutation({
    mutationFn: async (month: string) => {
      const start = `${month}-01`;
      const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
        .toISOString()
        .slice(0, 10);
      const { error } = await sb
        .from("revenue")
        .update({ reconciled_at: new Date().toISOString(), reconciled_by: user?.id ?? null })
        .is("reconciled_at", null)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["close-data"] });
      toast.success("Deposits marked reconciled");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (dataQ.error) return <QueryError error={dataQ.error} onRetry={() => dataQ.refetch()} />;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Monthly close"
        description="Reconcile each month's deposits, then lock it so the books stop moving."
      />

      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Closed months" value={String(summary.closed)} tone="positive" hint="Locked — no edits to income, expenses or withdrawals dated inside them." />
        <StatCard label="Open months" value={String(summary.open)} hint="Still editable." />
        <StatCard
          label="Unreconciled deposits"
          value={String(summary.unreconciled)}
          tone={summary.unreconciled ? "negative" : "positive"}
          hint="Deposits in open months not yet ticked off against the bank."
        />
      </section>

      {dataQ.isLoading ? (
        <TableSkeleton />
      ) : (
        <TableFrame resizeKey="close">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-3 px-4">Month</th>
                <th className="py-3 px-4">Revenue</th>
                <th className="py-3 px-4">Fees</th>
                <th className="py-3 px-4">Net</th>
                <th className="py-3 px-4">Expenses</th>
                <th className="py-3 px-4">Withdrawals</th>
                <th className="py-3 px-4">Result</th>
                <th className="py-3 px-4">Reconciled</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const result = r.net - r.expenses - r.withdrawals;
                const done = r.deposits > 0 && r.reconciled >= r.deposits;
                return (
                  <tr key={r.month} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="py-3 px-4 font-medium">{monthLabel(r.month)}</td>
                    <td className="py-3 px-4">{fmtMoney(r.revenue)}</td>
                    <td className="py-3 px-4 text-destructive">{r.fees ? `−${fmtMoney(r.fees)}` : "—"}</td>
                    <td className="py-3 px-4">{fmtMoney(r.net)}</td>
                    <td className="py-3 px-4 text-destructive">{r.expenses ? `−${fmtMoney(r.expenses)}` : "—"}</td>
                    <td className="py-3 px-4 text-destructive">{r.withdrawals ? `−${fmtMoney(r.withdrawals)}` : "—"}</td>
                    <td className={`py-3 px-4 font-medium ${result >= 0 ? "text-money-up" : "text-money-down"}`}>
                      {fmtMoney(result)}
                    </td>
                    <td className="py-3 px-4">
                      {r.deposits === 0 ? (
                        <span className="text-muted-foreground">no deposits</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          )}
                          {r.reconciled}/{r.deposits}
                          {!done && isAdmin && !r.closed && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => reconcileMonth.mutate(r.month)}
                            >
                              Mark all
                            </Button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {r.closed ? (
                        <span className="inline-flex items-center gap-2">
                          <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                            <Lock className="h-3 w-3 mr-1" />Locked
                          </Badge>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                    onClick={() => setPending({ month: r.month, close: false })}>
                              Reopen
                            </Button>
                          )}
                        </span>
                      ) : isAdmin ? (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                onClick={() => setPending({ month: r.month, close: true })}>
                          <LockOpen className="h-3 w-3 mr-1" />Close month
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">Open</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}

      {closesQ.data?.length ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Last close: {monthLabel(closesQ.data[0]!.period_month)} by {closesQ.data[0]!.user_email ?? "—"} on{" "}
          {fmtDate(closesQ.data[0]!.closed_at)}
        </p>
      ) : null}

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.close ? `Close ${pending && monthLabel(pending.month)}?` : `Reopen ${pending && monthLabel(pending.month)}?`}
            </DialogTitle>
            <DialogDescription>
              {pending?.close
                ? "Income, expenses and withdrawals dated in this month become read-only for everyone, including admins, until it is reopened."
                : "Reopening lets the books change again. Anything edited afterwards will not match the figures you already reported."}
            </DialogDescription>
          </DialogHeader>
          {pending?.close && (
            <Textarea
              rows={3}
              placeholder="Notes for the record (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPending(null); setNotes(""); }}>Cancel</Button>
            <Button
              disabled={toggle.isPending}
              onClick={() => pending && toggle.mutate(pending)}
            >
              {pending?.close ? "Lock month" : "Reopen month"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
