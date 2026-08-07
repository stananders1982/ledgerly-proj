/**
 * Data Quality — one place to spot and fix gaps in the workspace's records.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/data-quality")({
  head: () => ({
    meta: [
      { title: "Data Quality — Ledgerly" },
      { name: "description", content: "Spot missing sources, payment methods, duplicates and other record gaps before they distort your reports." },
      { property: "og:title", content: "Data Quality — Ledgerly" },
      { property: "og:description", content: "Spot missing sources, payment methods, duplicates and other record gaps before they distort your reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataQualityPage,
});

export type QualityIssue = {
  key: string;
  label: string;
  detail: string;
  count: number;
  to: string;
  severity: "high" | "medium" | "low";
};

/** Shared checker so the dashboard card and this page never disagree. */
export function useDataQuality() {
  const leadsQ = useQuery({
    queryKey: ["dq-leads"],
    queryFn: async () =>
      (await fetchAll(() => supabase.from("daily_lead_entries").select("id,source_id,received"))) ?? [],
  });
  const revQ = useQuery({
    queryKey: ["dq-revenue"],
    queryFn: async () =>
      (await fetchAll(() =>
        supabase.from("revenue").select("id,method,customer_name,amount,employee_id,activation_id"),
      )) ?? [],
  });
  const actQ = useQuery({
    queryKey: ["dq-activations"],
    queryFn: async () =>
      (await fetchAll(() =>
        supabase
          .from("daily_lead_activations")
          .select("id,lead_name,potential,employee_id,conversion_employee_id,qualified_at,balance"),
      )) ?? [],
  });
  const empQ = useQuery({
    queryKey: ["dq-employees"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id,name,team,salary,active");
      return data ?? [];
    },
  });
  // Directory RPC works for non-admins too, so team-based checks stay correct
  // for users who can't read the employees table directly.
  const dirQ = useQuery({
    queryKey: ["dq-emp-directory"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_employees_directory");
      return (data ?? []) as any[];
    },
  });

  const isLoading = leadsQ.isLoading || revQ.isLoading || actQ.isLoading || empQ.isLoading;

  const issues = useMemo<QualityIssue[]>(() => {
    const leads = (leadsQ.data ?? []) as any[];
    const revenue = (revQ.data ?? []) as any[];
    const acts = (actQ.data ?? []) as any[];
    const emps = ((empQ.data ?? []) as any[]).filter((e) => e.active !== false);
    const teamSource = ((empQ.data ?? []) as any[]).length
      ? ((empQ.data ?? []) as any[])
      : ((dirQ.data ?? []) as any[]);
    const retentionIds = new Set(teamSource.filter((e) => e.team === "R").map((e) => e.id));

    const named = acts.filter((a) => (a.lead_name ?? "").trim());
    const nameCounts = new Map<string, number>();
    for (const a of named) {
      const k = a.lead_name.trim().toLowerCase();
      nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
    }
    const duplicates = [...nameCounts.values()].filter((n) => n > 1).length;

    const revenueNames = new Set(
      revenue.map((r) => (r.customer_name ?? "").trim().toLowerCase()).filter(Boolean),
    );
    const revenueActivationIds = new Set(revenue.map((r) => r.activation_id).filter(Boolean));
    // A client counts as funded when they hold an opening balance, or a deposit
    // is linked to them by activation or by name.
    const clientsNoRevenue = named.filter(
      (a) =>
        Number(a.balance || 0) <= 0 &&
        !revenueActivationIds.has(a.id) &&
        !revenueNames.has(a.lead_name.trim().toLowerCase()),
    ).length;

    return [
      {
        key: "leads-no-source",
        label: "Lead entries with no source",
        detail: "Cost, ROI and affiliate reporting skip these rows.",
        count: leads.filter((l) => !l.source_id).length,
        to: "/leads",
        severity: "high",
      },
      {
        key: "revenue-no-method",
        label: "Income with no payment method",
        detail: "Method fees can't be applied, so commissions may be overstated.",
        count: revenue.filter((r) => !r.method).length,
        to: "/revenue",
        severity: "high",
      },
      {
        key: "revenue-no-activation",
        label: "Deposits with no client link",
        detail: "These fall back to fragile name matching for FTD, STD and balances.",
        count: revenue.filter((r) => !r.activation_id).length,
        to: "/revenue",
        severity: "high",
      },
      {
        key: "revenue-no-agent",
        label: "Income with no agent",
        detail: "These deposits never reach anyone's performance figures.",
        count: revenue.filter((r) => !r.employee_id).length,
        to: "/revenue",
        severity: "medium",
      },

      {
        key: "clients-no-name",
        label: "Activations with no client name",
        detail: "Unnamed activations can't be matched to deposits or STDs.",
        count: acts.filter((a) => !(a.lead_name ?? "").trim()).length,
        to: "/activations",
        severity: "high",
      },
      {
        key: "clients-unallocated-ftd",
        label: "Valid FTDs with no retention agent",
        detail: "Qualified clients nobody is holding — no follow-up and no STD credit.",
        count: acts.filter(
          (a) => a.qualified_at && !retentionIds.has(a.employee_id as string),
        ).length,
        to: "/activations",
        severity: "high",
      },
      {
        key: "clients-no-potential",
        label: "Clients with no potential set",
        detail: "Low-potential deposit alerts won't fire for these clients.",
        count: named.filter((a) => !a.potential).length,
        to: "/activations",
        severity: "low",
      },
      {
        key: "clients-duplicate",
        label: "Duplicate client names",
        detail: "The same person logged twice inflates FTD counts.",
        count: duplicates,
        to: "/activations",
        severity: "medium",
      },
      {
        key: "clients-no-revenue",
        label: "Clients with no deposit recorded",
        detail: "Activated but never funded — worth a follow-up call.",
        count: clientsNoRevenue,
        to: "/activations",
        severity: "low",
      },
      {
        key: "employees-no-team",
        label: "Employees with no team",
        detail: "Team C/R filters and STD reporting exclude them.",
        count: emps.filter((e) => !e.team).length,
        to: "/employees",
        severity: "medium",
      },
      {
        key: "employees-no-salary",
        label: "Employees with no salary",
        detail: "Payroll, attendance deductions and break-even are understated.",
        count: emps.filter((e) => !Number(e.salary)).length,
        to: "/employees",
        severity: "medium",
      },
    ];
  }, [leadsQ.data, revQ.data, actQ.data, empQ.data, dirQ.data]);

  const open = issues.filter((i) => i.count > 0);
  const total = open.reduce((s, i) => s + i.count, 0);

  return { issues, open, total, isLoading };
}

const severityTone: Record<QualityIssue["severity"], string> = {
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

function DataQualityPage() {
  const { issues, open, total, isLoading } = useDataQuality();
  const clean = issues.length - open.length;

  return (
    <div>
      <PageHeader
        title="Data Quality"
        description="Gaps and duplicates that quietly distort your reports — fix them at the source."
      />

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        <StatCard label="Records needing attention" value={String(total)} icon={AlertTriangle} />
        <StatCard label="Checks failing" value={`${open.length} of ${issues.length}`} icon={ShieldAlert} />
        <StatCard label="Checks passing" value={String(clean)} icon={CheckCircle2} />
      </div>

      <div className="card-surface mt-6 divide-y divide-border">
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Checking your records…</p>
        ) : (
          issues
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((i) => (
              <Link
                key={i.key}
                to={i.to}
                search={{ issue: i.key } as any}
                className={cn(
                  "flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/40",
                  i.count === 0 && "opacity-60",
                )}
              >
                {i.count === 0 ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{i.label}</span>
                    {i.count > 0 && (
                      <Badge variant="secondary" className={severityTone[i.severity]}>
                        {i.severity}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{i.detail}</p>
                </div>
                <span className="shrink-0 font-display text-lg font-semibold tabular-nums">{i.count}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
        )}
      </div>
    </div>
  );
}
