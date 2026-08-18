import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { CoachingInsights } from "@/components/coaching-insights";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePagination, TablePagination } from "@/components/pagination";
import { depositIndex, effectiveBalanceIndexed, qualifiesAsFtd, ftdPendingReason, isStd } from "@/lib/rules";
import { useCompanySettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth-context";
import { useCan } from "@/lib/permissions";
import { downloadPayslip, payslipTotals, monthLabel, loadLogoDataUrl, buildRetentionTransactions, type PayslipInput } from "@/lib/payslip";
import { commissionAmount, commissionRate, commissionableAmount, type CommissionTiers } from "@/lib/commission";

const sb = supabase as any;


/** Flat commission paid to the conversion agent per qualifying FTD. */


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
  const settings = useCompanySettings();
  const { company, companyId, user } = useAuth();
  const can = useCan();
  const qc = useQueryClient();

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
        .select("id,date,customer_name,amount,method,employee_id,employee_id_2,split_pct,affiliates(name)")
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
      const data = await fetchAll(() => sb
        .from("daily_lead_activations")
        .select("activated_count, lead_name, activation_date, daily_lead_entries(entry_date)")
        .eq("employee_id", id)
        .eq("legacy", false)
        .gte("activation_date", start)
        .lte("activation_date", end));
      return data ?? [];
    },
  });

  // FTDs — leads this employee activated (as conversion agent).
  // Counted in the month the lead *became valid* (qualified_at), which can be
  // later than the activation month. Pending leads are listed by activation date.
  // Legacy (old CRM) clients never count here.
  const conversionsQ = useQuery({
    enabled: isConversion,
    queryKey: ["employee-conversions", id, start, end],
    queryFn: async () => {
      const counted = await fetchAll(() => sb
        .from("daily_lead_activations")
        .select("id, lead_name, potential, answered, balance, activation_date, qualified_at, daily_lead_entries(entry_date)")
        .eq("conversion_employee_id", id)
        .eq("legacy", false)
        .gte("qualified_at", start)
        .lte("qualified_at", end));
      const pending = await fetchAll(() => sb
        .from("daily_lead_activations")
        .select("id, lead_name, potential, answered, balance, activation_date, qualified_at, daily_lead_entries(entry_date)")
        .eq("conversion_employee_id", id)
        .eq("legacy", false)
        .is("qualified_at", null)
        .gte("activation_date", start)
        .lte("activation_date", end));
      return { counted: counted ?? [], pending: pending ?? [] };
    },
  });

  // Deposits matched by customer name (same rule as the Activated Leads page).
  const depositsQ = useQuery({
    enabled: isConversion,
    queryKey: ["revenue-by-name"],
    queryFn: async () => {
      const data = await fetchAll(() => sb.from("revenue").select("activation_id, customer_name, amount"));
      return (data ?? []) as { activation_id: string | null; customer_name: string | null; amount: number }[];
    },
  });

  // STD (retention only): every client this agent handles + every dated deposit.
  const stdSourceQ = useQuery({
    enabled: isRetention,
    queryKey: ["employee-std-source", id],
    queryFn: async () => {
      const acts = await fetchAll(() => sb
        .from("daily_lead_activations")
        .select("id, lead_name, activation_date")
        .eq("employee_id", id));
      const deps = await fetchAll(() => sb
        .from("revenue")
        .select("id, activation_id, customer_name, amount, date"));
      return { acts: acts ?? [], deps: deps ?? [] };
    },
  });

  const stdCount = useMemo(() => {
    if (!isRetention || !stdSourceQ.data) return 0;
    const { acts, deps } = stdSourceQ.data as { acts: any[]; deps: any[] };
    return acts.filter((a) => isStd(a, deps, { start, end })).length;
  }, [isRetention, stdSourceQ.data, start, end]);

  // Payslips previously generated for this employee.
  const payslipsQ = useQuery({
    queryKey: ["payslips", id],
    queryFn: async () =>
      (await sb
        .from("payslips")
        .select("id, month, gross_commission, net_payable, user_email, created_at")
        .eq("employee_id", id)
        .order("created_at", { ascending: false })
        .limit(24)).data ?? [],
  });



  const conversions = useMemo(() => {
    const deposits = depositIndex(depositsQ.data ?? []);
    const decorate = (r: any, qualifies: boolean) => {
      const bal = effectiveBalanceIndexed(r, deposits);
      return { ...r, effectiveBalance: bal, qualifies, reason: qualifies ? "" : ftdPendingReason(r, bal, settings) };
    };
    const counted = ((conversionsQ.data?.counted ?? []) as any[]).map((r) => decorate(r, true));
    const pending = ((conversionsQ.data?.pending ?? []) as any[]).map((r) => decorate(r, false));
    return { all: [...counted, ...pending], counted, pending };
  }, [conversionsQ.data, depositsQ.data, settings]);


  const conversionRows = useMemo(() => [...conversions.counted, ...conversions.pending], [conversions]);
  const { pageItems: convPage, ...pgConv } = usePagination(conversionRows, 30);
  const { pageItems: revPage, ...pgRev } = usePagination(revQ.data ?? [], 30);
  const { pageItems: withPage, ...pgWith } = usePagination(withQ.data ?? [], 30);




  const emp = empQ.data as any;

  const totals = useMemo(() => {
    const rev = revQ.data ?? [];
    const wds = withQ.data ?? [];
    const att = attQ.data ?? [];

    const share = (r: any, amt: number) => {
      const pct = Number(r.split_pct ?? 100);
      if (r.employee_id === id) return amt * (pct / 100);
      if (r.employee_id_2 === id) return amt * ((100 - pct) / 100);
      return 0;
    };
    const attributed = rev.reduce((s: number, r: any) => s + share(r, Number(r.amount)), 0);
    // Commission base after the configured deposit-method fee.
    const commBase = rev.reduce((s: number, r: any) => s + share(r, commissionableAmount(r.amount, r.method, settings)), 0);

    const withdrawn = wds.reduce((s: number, w: any) => s + Number(w.amount), 0);
    const penalty = wds.reduce((s: number, w: any) => s + Number(w.employee_penalty), 0);

    const tiers: CommissionTiers | null = emp ? {
      commission_tier1_max: Number(emp.commission_tier1_max),
      commission_tier1_pct: Number(emp.commission_tier1_pct),
      commission_tier2_max: Number(emp.commission_tier2_max),
      commission_tier2_pct: Number(emp.commission_tier2_pct),
      commission_tier3_pct: Number(emp.commission_tier3_pct),
    } : null;

    const commission = tiers ? commissionAmount(commBase, tiers) : 0;
    const rate = tiers ? commissionRate(commBase, tiers) : 0;

    const wd = workingDays(start, end);
    const present = att.filter((a: any) => a.present).length;
    const absent = att.filter((a: any) => !a.present).length;
    const unmarked = Math.max(0, wd - present - absent);
    const perDay = wd > 0 ? Number(emp?.salary ?? 0) / wd : 0;
    const deduction = absent * perDay;
    const salary = Math.max(0, Number(emp?.salary ?? 0) - deduction);

    const ftdCount = isConversion ? conversions.counted.length : 0;
    // Per-FTD rate is configured on the employee (conversion agents).
    const ftdRate = Number(emp?.ftd_commission ?? settings.ftdCommission);
    const ftdCommission = ftdCount * ftdRate;

    // STD bonus is a retention-only incentive, configured per employee.
    const stdRate = Number(emp?.std_bonus ?? 0);
    const stdBonus = isRetention ? stdCount * stdRate : 0;

    const payout = salary + (isRetention ? commission - penalty + stdBonus : 0) + ftdCommission;

    const clients = (clientsQ.data ?? []).reduce((s: number, r: any) => s + Number(r.activated_count || 0), 0);
    const revenuePerClient = clients > 0 ? attributed / clients : 0;

    return { attributed, commBase, withdrawn, penalty, commission, rate, wd, present, absent, unmarked, perDay, deduction, salary, payout, clients, revenuePerClient, ftdCount, ftdCommission, ftdRate, stdRate, stdBonus };
  }, [revQ.data, withQ.data, attQ.data, clientsQ.data, conversions, emp, id, start, end, isConversion, isRetention, settings, stdCount]);


  if (empQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!emp) return (
    <div className="p-8">
      <p className="text-sm text-muted-foreground mb-4">Employee not found.</p>
      <Button variant="outline" onClick={() => navigate({ to: "/employees" })}><ArrowLeft className="h-4 w-4" /> Back</Button>
    </div>
  );

  const payslipInput = (logoDataUrl: string | null): PayslipInput => ({
    companyName: company?.name ?? "Company",
    logoDataUrl,
    employeeName: emp.name,
    teamLabel,
    role: emp.role,
    month,
    baseSalary: Number(emp.salary ?? 0),
    workingDays: totals.wd,
    absentDays: totals.absent,
    perDayRate: totals.perDay,
    absenceDeduction: totals.deduction,
    ftdCount: totals.ftdCount,
    ftdRate: totals.ftdRate,
    ftdCommission: isConversion ? totals.ftdCommission : 0,
    revenueBase: isRetention ? totals.commBase : 0,
    commissionPct: isRetention ? totals.rate : 0,
    revenueCommission: isRetention ? totals.commission : 0,
    stdCount: isRetention ? stdCount : 0,
    stdRate: totals.stdRate,
    stdBonus: totals.stdBonus,
    withdrawalPenalty: isRetention ? totals.penalty : 0,
    // Retention agents get the full, privacy-safe transaction breakdown.
    transactions: isRetention
      ? buildRetentionTransactions({
          employeeId: emp.id,
          revenue: (revQ.data ?? []) as any[],
          withdrawals: (withQ.data ?? []) as any[],
          commissionPct: totals.rate,
          settings,
          defaultPenaltyPct: settings.withdrawalPenaltyPct,
        })
      : undefined,
  });

  const handlePayslip = async () => {
    if (!can("export_data")) return toast.error("You don't have permission to export data.");
    const logo = await loadLogoDataUrl(settings.logoUrl);
    const input = payslipInput(logo);
    downloadPayslip(input);
    const t = payslipTotals(input);
    if (companyId) {
      await sb.from("payslips").insert({
        company_id: companyId,
        employee_id: emp.id,
        month,
        gross_commission: t.grossCommission,
        net_payable: t.netPayable,
        generated_by: user?.id ?? null,
        user_email: user?.email ?? null,
      });
      qc.invalidateQueries({ queryKey: ["payslips", id] });
    }
    toast.success(`Payslip for ${monthLabel(month)} downloaded`);
  };

  return (
    <div>
      <PageHeader
        title={emp.name}
        description={`${emp.active ? "Active" : "Inactive"} · ${teamLabel} · Base salary ${fmtMoney(emp.salary)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
            <Button onClick={handlePayslip}><Download className="h-4 w-4" /> Download payslip</Button>
            <Button variant="outline" asChild><Link to="/employees"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
          </div>
        }
      />


      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {isRetention && (
          <>
            <StatCard label="Attributed revenue" value={fmtMoney(totals.attributed)} tone="positive" />
            <StatCard
              label="Net revenue"
              value={fmtMoney(totals.commBase)}
              tone="positive"
              hint="After card / wire / crypto deposit fees"
            />
            <StatCard label={`Commission (${totals.rate}%)`} value={fmtMoney(totals.commission)} tone="positive" />

          </>
        )}
        {isConversion && (
          <>
            <StatCard label="FTDs (activations)" value={String(conversions.counted.length)} tone="positive" />
            <StatCard label={`FTD commission (${fmtMoney(totals.ftdRate)}/FTD)`} value={fmtMoney(totals.ftdCommission)} tone="positive" />
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

      {/* Managers are not ranked against agents. */}
      {!isMarketing && <CoachingInsights employeeId={emp.id} month={month} />}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Working days" value={String(totals.wd)} />
        <StatCard label="Absences" value={`${totals.absent} · −${fmtMoney(totals.deduction)}`} tone={totals.absent ? "negative" : "default"} />
      </section>


      {isConversion && (
      <div className="card-surface overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">
              Activations ({conversions.all.length}) — {conversions.counted.length} counted
              {conversions.pending.length > 0 && ` · ${conversions.pending.length} pending`}
            </h3>
            <p className="text-xs text-muted-foreground">
              Counted in the month the lead became valid ({conversions.counted.length} × {fmtMoney(totals.ftdRate)}) — including leads activated earlier. Pending rows are excluded from commission.
            </p>
          </div>
          <Link to="/activations" search={{ client: undefined, name: undefined }} className="text-xs text-primary hover:underline">Manage</Link>
        </div>
        {conversions.all.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No activations as conversion agent this month.</div>
        ) : (
          <div className="overflow-x-auto scroll-slim max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 px-4">Activated</th>
                  <th className="py-2 px-4">Qualified</th>
                  <th className="py-2 px-4">Lead</th>
                  <th className="py-2 px-4">Potential</th>
                  <th className="py-2 px-4 text-right">Balance</th>
                  <th className="py-2 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {convPage.map((c: any, i: number) => (
                  <tr key={`ftd-${i}`} className={cn("border-b border-border/50", c.qualifies ? "" : "text-muted-foreground")}>
                    <td className="py-2 px-4 text-muted-foreground">{fmtDate(c.activation_date ?? c.daily_lead_entries?.entry_date)}</td>
                    <td className="py-2 px-4">
                      {c.qualified_at ? (
                        <>
                          {fmtDate(c.qualified_at)}
                          {String(c.qualified_at).slice(0, 7) !== String(c.activation_date ?? "").slice(0, 7) && (
                            <span className="ml-1 text-xs text-muted-foreground">(late)</span>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-2 px-4">{c.lead_name || "—"}</td>
                    <td className="py-2 px-4 capitalize">{c.potential ?? "—"}</td>
                    <td className="py-2 px-4 text-right">{fmtMoney(c.effectiveBalance)}</td>
                    <td className={cn("py-2 px-4", c.qualifies ? "text-primary" : "")}>{c.qualifies ? "Counted" : c.reason}</td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination {...pgConv} />
      </div>
      )}


      {isRetention && (
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="card-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Revenue ({(revQ.data ?? []).length})</h3>
            <Link to="/revenue" className="text-xs text-primary hover:underline">Manage</Link>
          </div>
          {(revQ.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No revenue this month.</div>
          ) : (
            <div className="overflow-x-auto scroll-slim max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 px-4">Date</th>
                    <th className="py-2 px-4">Customer</th>
                    <th className="py-2 px-4">Affiliate</th>
                    <th className="py-2 px-4 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {revPage.map((r: any) => {
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
          <TablePagination {...pgRev} />
        </div>

        <div className="card-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Withdrawals ({(withQ.data ?? []).length})</h3>
            <Link to="/withdrawals" className="text-xs text-primary hover:underline">Manage</Link>
          </div>
          {(withQ.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No withdrawals this month.</div>
          ) : (
            <div className="overflow-x-auto scroll-slim max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 px-4">Date</th>
                    <th className="py-2 px-4">Customer</th>
                    <th className="py-2 px-4 text-right">Amount</th>
                    <th className="py-2 px-4 text-right">Penalty</th>
                  </tr>
                </thead>
                <tbody>
                  {withPage.map((w: any) => (
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
          <TablePagination {...pgWith} />
        </div>
      </div>
      )}

      <div className="card-surface p-5">
        <h3 className="font-display text-base font-semibold mb-3">Payout breakdown</h3>
        <div className="text-sm divide-y divide-border/50">
          <Row label="Base salary" value={fmtMoney(emp.salary)} />
          <Row label={`Absence deduction (${totals.absent} × ${fmtMoney(totals.perDay)})`} value={`−${fmtMoney(totals.deduction)}`} negative />
          {isRetention && (
            <>
              <Row label={`Commission (${totals.rate}% on ${fmtMoney(totals.commBase)})`} value={`+${fmtMoney(totals.commission)}`} positive />
              {totals.stdRate > 0 && (
                <Row label={`STD bonus (${stdCount} × ${fmtMoney(totals.stdRate)})`} value={`+${fmtMoney(totals.stdBonus)}`} positive />
              )}
              <Row label="Withdrawal penalty (10%)" value={`−${fmtMoney(totals.penalty)}`} negative />
            </>
          )}
          {isConversion && (
            <Row label={`FTD commission (${totals.ftdCount} × ${fmtMoney(totals.ftdRate)})`} value={`+${fmtMoney(totals.ftdCommission)}`} positive />
          )}
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

      <div className="card-surface overflow-hidden mt-6">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-base font-semibold">Payslip history</h3>
        </div>
        {((payslipsQ.data ?? []) as any[]).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No payslips generated yet for this employee.</div>
        ) : (
          <div className="overflow-x-auto scroll-slim max-h-[320px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="table-head text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 px-4">Period</th>
                  <th className="py-2 px-4">Downloaded</th>
                  <th className="py-2 px-4">By</th>
                  <th className="py-2 px-4 text-right">Gross commission</th>
                  <th className="py-2 px-4 text-right">Net payable</th>
                </tr>
              </thead>
              <tbody>
                {((payslipsQ.data ?? []) as any[]).map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="py-2 px-4 font-medium">{monthLabel(p.month)}</td>
                    <td className="py-2 px-4 text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="py-2 px-4 text-muted-foreground">{p.user_email || "—"}</td>
                    <td className="py-2 px-4 text-right">{fmtMoney(p.gross_commission)}</td>
                    <td className="py-2 px-4 text-right font-medium">{fmtMoney(p.net_payable)}</td>
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

function Row({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={positive ? "text-primary font-medium" : negative ? "text-destructive font-medium" : "font-medium"}>{value}</span>
    </div>
  );
}
