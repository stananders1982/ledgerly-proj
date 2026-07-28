import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate, fmtMoney } from "@/lib/format";
import { commissionAmount, commissionRate, type CommissionTiers } from "@/lib/commission";

const sb = supabase as any;

/** Flat commission paid to the conversion agent per qualifying FTD. */
const FTD_COMMISSION = 100;

export const Route = createFileRoute("/_authenticated/employees/$id")({
  head: () => ({ meta: [{ title: "Employee — Ledgerly" }] }),
  component: EmployeeDetailPage,
});

function monthRange(month: string) {
  // month: "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function workingDays(startISO: string, endISO: string) {
  let n = 0;
  const d = new Date(startISO);
  const e = new Date(endISO);
  while (d <= e) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

function EmployeeDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { start, end } = monthRange(month);

  const empQ = useQuery({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const team = String((empQ.data as any)?.team ?? "R").toUpperCase();
  const isConversion = team === "C";
  const isRetention = team === "R";
  const isMarketing = team === "M";
  const teamLabel = isConversion ? "Conversion" : isRetention ? "Retention" : isMarketing ? "Marketing" : "Team";

  const revQ = useQuery({
    enabled: isRetention,
    queryKey: ["employee-revenue", id, start, end],
    queryFn: async () =>
      (await supabase
        .from("revenue")
        .select("id,date,customer_name,amount,employee_id,employee_id_2,split_pct,affiliates(name)")
        .or(`employee_id.eq.${id},employee_id_2.eq.${id}`)
        .gte("date", start).lte("date", end)
        .order("date", { ascending: false })).data ?? [],
  });

  const withQ = useQuery({
    enabled: isRetention,
    queryKey: ["employee-withdrawals", id, start, end],
    queryFn: async () =>
      (await sb
        .from("withdrawals")
        .select("id,date,customer_name,amount,employee_penalty")
        .eq("employee_id", id)
        .gte("date", start).lte("date", end)
        .order("date", { ascending: false })).data ?? [],
  });

  const attQ = useQuery({
    queryKey: ["employee-attendance", id, start, end],
    queryFn: async () =>
      (await sb
        .from("attendance")
        .select("id,date,present")
        .eq("employee_id", id)
        .gte("date", start).lte("date", end)).data ?? [],
  });

  const clientsQ = useQuery({
    enabled: isRetention || isConversion,
    queryKey: ["employee-clients", id, start, end],
    queryFn: async () => {
      const { data, error } = await sb
        .from("daily_lead_activations")
        .select("activated_count, lead_name, daily_lead_entries!inner(entry_date)")
        .eq("employee_id", id)
        .gte("daily_lead_entries.entry_date", start)
        .lte("daily_lead_entries.entry_date", end);
      if (error) throw error;
      return data ?? [];
    },
  });

  // FTDs — leads this employee activated (as conversion agent).
  // Counted when answered AND (mid/high potential OR effective balance >= 251).
  const conversionsQ = useQuery({
    enabled: isConversion,
    queryKey: ["employee-conversions", id, start, end],
    queryFn: async () => {
      const { data, error } = await sb
        .from("daily_lead_activations")
        .select("lead_name, potential, answered, balance, daily_lead_entries!inner(entry_date)")
        .eq("conversion_employee_id", id)
        .gte("daily_lead_entries.entry_date", start)
        .lte("daily_lead_entries.entry_date", end);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Deposits matched by customer name (same rule as the Activated Leads page).
  const depositsQ = useQuery({
    enabled: isConversion,
    queryKey: ["revenue-by-name"],
    queryFn: async () => {
      const { data, error } = await sb.from("revenue").select("customer_name, amount");
      if (error) throw error;
      return (data ?? []) as { customer_name: string | null; amount: number }[];
    },
  });


  const conversions = useMemo(() => {
    const deposits = new Map<string, number>();
    for (const r of depositsQ.data ?? []) {
      const k = (r.customer_name ?? "").trim().toLowerCase();
      if (!k) continue;
      deposits.set(k, (deposits.get(k) ?? 0) + Number(r.amount || 0));
    }
    const all = ((conversionsQ.data ?? []) as any[]).map((r) => {
      const effectiveBalance =
        Number(r.balance || 0) + (deposits.get((r.lead_name ?? "").trim().toLowerCase()) ?? 0);
      const qualifies =
        !!r.answered &&
        (r.potential === "mid" || r.potential === "high" || effectiveBalance >= 251);
      const reason = !r.answered ? "Not answered yet" : "Low potential under $251";
      return { ...r, effectiveBalance, qualifies, reason };
    });
    return { all, counted: all.filter((r) => r.qualifies), pending: all.filter((r) => !r.qualifies) };
  }, [conversionsQ.data, depositsQ.data]);




  const emp = empQ.data as any;

  const totals = useMemo(() => {
    const rev = revQ.data ?? [];
    const wds = withQ.data ?? [];
    const att = attQ.data ?? [];

    const attributed = rev.reduce((s: number, r: any) => {
      const amt = Number(r.amount);
      const pct = Number(r.split_pct ?? 100);
      if (r.employee_id === id) return s + amt * (pct / 100);
      if (r.employee_id_2 === id) return s + amt * ((100 - pct) / 100);
      return s;
    }, 0);

    const withdrawn = wds.reduce((s: number, w: any) => s + Number(w.amount), 0);
    const penalty = wds.reduce((s: number, w: any) => s + Number(w.employee_penalty), 0);

    const tiers: CommissionTiers | null = emp ? {
      commission_tier1_max: Number(emp.commission_tier1_max),
      commission_tier1_pct: Number(emp.commission_tier1_pct),
      commission_tier2_max: Number(emp.commission_tier2_max),
      commission_tier2_pct: Number(emp.commission_tier2_pct),
      commission_tier3_pct: Number(emp.commission_tier3_pct),
    } : null;

    const commission = tiers ? commissionAmount(attributed, tiers) : 0;
    const rate = tiers ? commissionRate(attributed, tiers) : 0;

    const wd = workingDays(start, end);
    const present = att.filter((a: any) => a.present).length;
    const absent = att.filter((a: any) => !a.present).length;
    const unmarked = Math.max(0, wd - present - absent);
    const perDay = wd > 0 ? Number(emp?.salary ?? 0) / wd : 0;
    const deduction = absent * perDay;
    const salary = Math.max(0, Number(emp?.salary ?? 0) - deduction);

    const ftdCount = isConversion ? conversions.counted.length : 0;
    const ftdCommission = ftdCount * FTD_COMMISSION;

    const payout = salary + (isRetention ? commission - penalty : 0) + ftdCommission;

    const clients = (clientsQ.data ?? []).reduce((s: number, r: any) => s + Number(r.activated_count || 0), 0);
    const revenuePerClient = clients > 0 ? attributed / clients : 0;

    return { attributed, withdrawn, penalty, commission, rate, wd, present, absent, unmarked, perDay, deduction, salary, payout, clients, revenuePerClient, ftdCount, ftdCommission };
  }, [revQ.data, withQ.data, attQ.data, clientsQ.data, conversions, emp, id, start, end, isConversion, isRetention]);

  if (empQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!emp) return (
    <div className="p-8">
      <p className="text-sm text-muted-foreground mb-4">Employee not found.</p>
      <Button variant="outline" onClick={() => navigate({ to: "/employees" })}><ArrowLeft className="h-4 w-4" /> Back</Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={emp.name}
        description={`${emp.active ? "Active" : "Inactive"} · ${teamLabel} · Base salary ${fmtMoney(emp.salary)}`}
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
            <Button variant="outline" asChild><Link to="/employees"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {isRetention && (
          <>
            <StatCard label="Attributed revenue" value={fmtMoney(totals.attributed)} tone="positive" />
            <StatCard label={`Commission (${totals.rate}%)`} value={fmtMoney(totals.commission)} tone="positive" />
          </>
        )}
        {isConversion && (
          <>
            <StatCard label="FTDs (activations)" value={String(conversions.counted.length)} tone="positive" />
            <StatCard label={`FTD commission ($${FTD_COMMISSION}/FTD)`} value={fmtMoney(totals.ftdCommission)} tone="positive" />
          </>
        )}
        <StatCard label="Salary after absences" value={fmtMoney(totals.salary)} />
        <StatCard label="Net payout" value={fmtMoney(totals.payout)} tone="positive" />
      </section>

      {(isConversion || isRetention) && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {isConversion && (
            <>
              <StatCard label="Pending FTDs" value={String(conversions.pending.length)} />
              <StatCard label="Activated leads (clients)" value={String(totals.clients)} tone="positive" />
            </>
          )}
          {isRetention && (
            <>
              <StatCard label="Clients received (retention)" value={String(totals.clients)} tone="positive" />
              <StatCard label="Revenue / client" value={fmtMoney(totals.revenuePerClient)} tone="positive" />
              <StatCard label="Withdrawals" value={fmtMoney(totals.withdrawn)} tone="negative" />
              <StatCard label="Withdrawal penalty (10%)" value={fmtMoney(totals.penalty)} tone="negative" />
            </>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Working days" value={String(totals.wd)} />
        <StatCard label="Absences" value={`${totals.absent} · −${fmtMoney(totals.deduction)}`} tone={totals.absent ? "negative" : "default"} />
      </section>


      {isConversion && (
      <div className="card-surface overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">FTDs ({conversions.counted.length})</h3>
            <p className="text-xs text-muted-foreground">
              Answered leads with mid/high potential, or low potential with balance $251+.
            </p>
          </div>
          <Link to="/activations" className="text-xs text-primary hover:underline">Manage</Link>
        </div>
        {conversions.all.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No activations as conversion agent this month.</div>
        ) : (
          <div className="overflow-x-auto max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 px-4">Date</th>
                  <th className="py-2 px-4">Lead</th>
                  <th className="py-2 px-4">Potential</th>
                  <th className="py-2 px-4 text-right">Balance</th>
                  <th className="py-2 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {conversions.counted.map((c: any, i: number) => (
                  <tr key={`ftd-${i}`} className="border-b border-border/50">
                    <td className="py-2 px-4 text-muted-foreground">{fmtDate(c.daily_lead_entries?.entry_date)}</td>
                    <td className="py-2 px-4">{c.lead_name || "—"}</td>
                    <td className="py-2 px-4 capitalize">{c.potential ?? "—"}</td>
                    <td className="py-2 px-4 text-right">{fmtMoney(c.effectiveBalance)}</td>
                    <td className="py-2 px-4 text-primary">Counted</td>
                  </tr>
                ))}
                {conversions.pending.map((c: any, i: number) => (
                  <tr key={`pend-${i}`} className="border-b border-border/50 text-muted-foreground">
                    <td className="py-2 px-4">{fmtDate(c.daily_lead_entries?.entry_date)}</td>
                    <td className="py-2 px-4">{c.lead_name || "—"}</td>
                    <td className="py-2 px-4 capitalize">{c.potential ?? "—"}</td>
                    <td className="py-2 px-4 text-right">{fmtMoney(c.effectiveBalance)}</td>
                    <td className="py-2 px-4">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      <div className="card-surface overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">Activated leads ({(clientsQ.data ?? []).length})</h3>
          <Link to="/leads" className="text-xs text-primary hover:underline">Manage</Link>
        </div>
        {(clientsQ.data ?? []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No activated leads this month.</div>
        ) : (
          <div className="overflow-x-auto max-h-[320px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 px-4">Date</th>
                  <th className="py-2 px-4">Lead</th>
                  <th className="py-2 px-4 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {(clientsQ.data ?? []).map((c: any, i: number) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 px-4 text-muted-foreground">{fmtDate(c.daily_lead_entries?.entry_date)}</td>
                    <td className="py-2 px-4">{c.lead_name || "—"}</td>
                    <td className="py-2 px-4 text-right">{c.activated_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="card-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Revenue ({(revQ.data ?? []).length})</h3>
            <Link to="/revenue" className="text-xs text-primary hover:underline">Manage</Link>
          </div>
          {(revQ.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No revenue this month.</div>
          ) : (
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 px-4">Date</th>
                    <th className="py-2 px-4">Customer</th>
                    <th className="py-2 px-4">Affiliate</th>
                    <th className="py-2 px-4 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {(revQ.data ?? []).map((r: any) => {
                    const pct = Number(r.split_pct ?? 100);
                    const share = r.employee_id === id ? Number(r.amount) * (pct / 100) : Number(r.amount) * ((100 - pct) / 100);
                    return (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="py-2 px-4 text-muted-foreground">{fmtDate(r.date)}</td>
                        <td className="py-2 px-4">{r.customer_name}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.affiliates?.name || "—"}</td>
                        <td className="py-2 px-4 text-right text-primary font-medium">{fmtMoney(share)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Withdrawals ({(withQ.data ?? []).length})</h3>
            <Link to="/withdrawals" className="text-xs text-primary hover:underline">Manage</Link>
          </div>
          {(withQ.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No withdrawals this month.</div>
          ) : (
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 px-4">Date</th>
                    <th className="py-2 px-4">Customer</th>
                    <th className="py-2 px-4 text-right">Amount</th>
                    <th className="py-2 px-4 text-right">Penalty</th>
                  </tr>
                </thead>
                <tbody>
                  {(withQ.data ?? []).map((w: any) => (
                    <tr key={w.id} className="border-b border-border/50">
                      <td className="py-2 px-4 text-muted-foreground">{fmtDate(w.date)}</td>
                      <td className="py-2 px-4">{w.customer_name}</td>
                      <td className="py-2 px-4 text-right text-destructive">−{fmtMoney(w.amount)}</td>
                      <td className="py-2 px-4 text-right text-destructive">−{fmtMoney(w.employee_penalty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card-surface p-5">
        <h3 className="font-display text-base font-semibold mb-3">Payout breakdown</h3>
        <div className="text-sm divide-y divide-border/50">
          <Row label="Base salary" value={fmtMoney(emp.salary)} />
          <Row label={`Absence deduction (${totals.absent} × ${fmtMoney(totals.perDay)})`} value={`−${fmtMoney(totals.deduction)}`} negative />
          <Row label={`Commission (${totals.rate}% on ${fmtMoney(totals.attributed)})`} value={`+${fmtMoney(totals.commission)}`} positive />
          <Row label={`FTD commission (${totals.ftdCount} × ${fmtMoney(FTD_COMMISSION)})`} value={`+${fmtMoney(totals.ftdCommission)}`} positive />
          <Row label="Withdrawal penalty (10%)" value={`−${fmtMoney(totals.penalty)}`} negative />
          <div className="flex justify-between py-3 mt-2 border-t border-border font-display text-lg font-semibold">
            <span>Net payout</span>
            <span className="text-primary">{fmtMoney(totals.payout)}</span>
          </div>
        </div>
        {totals.unmarked > 0 && (
          <div className="mt-3 text-xs text-muted-foreground">
            {totals.unmarked} working day(s) unmarked in attendance for this month.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={positive ? "text-primary font-medium" : negative ? "text-destructive font-medium" : "font-medium"}>{value}</span>
    </div>
  );
}
