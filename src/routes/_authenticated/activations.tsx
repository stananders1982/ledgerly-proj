import { createFileRoute } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnsweredBadge, PotentialBadge as SharedPotentialBadge, LateFtdBadge } from "@/components/status-badge";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { EmployeeLink } from "@/components/employee-link";
import { AiClientPaste } from "@/components/ai-client-paste";
import { supabase } from "@/integrations/supabase/client";

import { PageHeader } from "@/components/page-header";
import { IssueFilterBanner } from "@/components/issue-filter-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtDate, fmtMoney, todayISO, getDisplayCurrency } from "@/lib/format";
import { toDisplay } from "@/lib/fx";
import { EmptyState } from "@/components/empty-state";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { StatCard } from "@/components/stat-card";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { ActivatedLeadsByEmployee } from "@/components/activated-leads-by-employee";
import { CheckCircle2, PhoneCall, Wallet, Copy, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination, PageSizeSelect } from "@/components/pagination";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { KYC_STATUS_LABELS, kycStatus } from "@/lib/kyc";
import { KycBadge } from "@/components/client-kyc-checklist";
import { clientHealth, HEALTH_BAND_LABEL, HEALTH_BAND_RANK, type ClientHealth } from "@/lib/client-health";
import { HealthBadge } from "@/components/client-health";
import { useTableToolbox, ColumnsMenu, FilterRow, FitToggle, TableKeyboardHint } from "@/components/table-toolbox";
import { TableFrame } from "@/components/table-frame";
import { qualifiesAsFtd, ftdPendingReasons, stdDepositsFor, activationDate, depositIndex, depositTotalFor, isLateRetentionFtd, monthsLate } from "@/lib/rules";
import { useCompanySettings } from "@/lib/settings";
import { CLIENT_TAGS, TagBadges, TagPicker } from "@/components/client-tags";
import { ClientCommunications, ClientTimeline, type TimelineEvent } from "@/components/client-activity";
import { FavoriteStar } from "@/components/favorite-star";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/confirm-delete";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Link } from "@tanstack/react-router";
import {
  ClientKycFields, ClientProfileFields, OpportunityBadge, RiskBadge, StatusBadge, TierBadge,
} from "@/components/client-profile-fields";
import { clientAge, type ClientProfile } from "@/lib/client-profile";
import {
  NEGLECT_WINDOW_DAYS, TIER_LABEL, TIER_RANK, VALUE_TIERS, isNeglected, lastDate, potentialValue, valueTier,
} from "@/lib/whales";

export const Route = createFileRoute("/_authenticated/activations")({
  validateSearch: (search: Record<string, unknown>) => ({
    client: typeof search.client === "string" ? search.client : undefined,
    name: typeof search.name === "string" ? search.name : undefined,
    ...(typeof search.issue === "string" ? { issue: search.issue } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Clients — Ledgerly" },
      { name: "description", content: "Track clients with balance, potential, agents and answer status." },
      { property: "og:title", content: "Clients — Ledgerly" },
      { property: "og:description", content: "Track clients with balance, potential, agents and answer status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivationsPage,
});

type Row = {
  id: string;
  entry_id: string;
  employee_id: string;
  conversion_employee_id: string | null;
  activated_count: number;
  lead_name: string | null;
  balance: number;
  potential: "low" | "mid" | "high" | null;
  answered: boolean;
  activation_date: string | null;
  qualified_at?: string | null;
  /** Imported from the old CRM — never credited as an FTD to a conversion agent. */
  legacy?: boolean | null;
  notes?: string | null;
  tags?: string[] | null;
  daily_lead_entries?: { entry_date: string; source_id: string | null; lead_sources?: { name: string } | null } | null;
} & ClientProfile;




/** Date the lead was actually activated (falls back to the lead entry date). */
const actDate = (r: Row) => r.activation_date ?? r.daily_lead_entries?.entry_date ?? null;

const POTENTIALS = ["low", "mid", "high"] as const;

function PotentialBadge({ value }: { value: Row["potential"] }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <SharedPotentialBadge potential={value} />;
}

function StdBadge({ count }: { count: number }) {
  if (!count) return <span className="text-muted-foreground">—</span>;
  return <Badge variant="default">STD</Badge>;
}


/** Clickable KPI card: explains itself, shows a hover/active state, and applies a table filter. */
function KpiCard({
  label,
  value,
  icon,
  hint,
  active,
  activeLabel,
  onClick,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  hint: string;
  active?: boolean;
  activeLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cn(
        "relative rounded-xl text-left transition-all duration-200 hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/30",
        active && "ring-2 ring-primary/60",
      )}
    >
      <StatCard label={label} value={value} icon={icon} hint={hint} />
      {active && (
        <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {activeLabel ?? "Filtered"}
        </span>
      )}
    </button>
  );
}

function ActivationsPage() {
  const settings = useCompanySettings();
  const qc = useQueryClient();
  const [range, setRange] = usePersistedState<RangeKey>("activations:range", "month");
  const [customStart, setCustomStart] = usePersistedState<string>("activations:range-start", "");
  const [customEnd, setCustomEnd] = usePersistedState<string>("activations:range-end", "");
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  
  const [answeredFilter, setAnsweredFilter] = useState<"all" | "yes" | "no">("all");
  const [potentialFilter, setPotentialFilter] = useState<string>("all");
  const [stdFilter, setStdFilter] = useState<"all" | "yes" | "no">("all");
  
  const [dupOnly, setDupOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [minPotential, setMinPotential] = useState<string>("");
  const [healthFilter, setHealthFilter] = useState<string>("all");

  const clearFilters = useCallback(() => {
    setAnsweredFilter("all");
    setPotentialFilter("all");
    setStdFilter("all");
    setDupOnly(false);
    setTagFilter("all");
    setTierFilter("all");
    setMinPotential("");
    setHealthFilter("all");
  }, []);


  const activeRange = useMemo(
    () => getRange(range, { start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );

  const q = useQuery({
    queryKey: ["activated-leads"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("daily_lead_activations")
        .select("*, daily_lead_entries(entry_date, source_id, lead_sources(name))")
        .order("created_at", { ascending: false }));
      return (data ?? []) as unknown as Row[];
    },
  });

  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const handledDeepLink = React.useRef<string | null>(null);

  React.useEffect(() => {
    const key = routeSearch.client ?? routeSearch.name;
    if (!key || !q.data || handledDeepLink.current === key) return;
    const match =
      q.data.find((r) => r.id === key) ??
      q.data.find(
        (r) => (r.lead_name ?? "").trim().toLowerCase() === key.trim().toLowerCase(),
      );
    handledDeepLink.current = key;
    if (match) {
      setViewing(match);
      setRange("year");
      
    }
    navigate({ search: { client: undefined, name: undefined }, replace: true });
  }, [routeSearch.client, routeSearch.name, q.data, navigate]);



  const employeesQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean; team?: string | null }[];
    },
  });

  const revenueQ = useQuery({
    queryKey: ["revenue-for-activations"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("revenue")
        .select("id, activation_id, customer_name, amount, date, notes, employee_id, affiliate_id")
        .order("date", { ascending: false }));
      return (data ?? []) as {
        id: string;
        activation_id: string | null;
        customer_name: string | null;
        amount: number;
        date: string;
        notes: string | null;
        employee_id: string | null;
        affiliate_id: string | null;
      }[];
    },
  });

  const withdrawalsQ = useQuery({
    queryKey: ["withdrawals-for-activations"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("withdrawals")
        .select("id, customer_name, amount, currency, date, notes")
        .order("date", { ascending: false }));
      return (data ?? []) as {
        id: string; customer_name: string | null; amount: number; currency: string | null; date: string; notes: string | null;
      }[];
    },
  });

  const commsQ = useQuery({
    queryKey: ["comms-for-activations"],
    queryFn: async () => {
      const data = await fetchAll(() => supabase
        .from("client_communications")
        .select("activation_id, client_name, occurred_at")
        .order("occurred_at", { ascending: false }));
      return (data ?? []) as { activation_id: string | null; client_name: string | null; occurred_at: string }[];
    },
  });

  // Deposits indexed by client link first; names only cover legacy rows.
  const deposits = useMemo(() => depositIndex(revenueQ.data ?? []), [revenueQ.data]);

  const depositsFor = (name?: string | null, activationId?: string | null) =>
    depositTotalFor({ id: activationId ?? null, lead_name: name ?? null }, deposits);

  const matchName = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

  // Prefer the direct activation link; fall back to name for older records.
  const depositRowsFor = (name?: string | null, activationId?: string | null) =>
    (revenueQ.data ?? []).filter((r) =>
      r.activation_id ? r.activation_id === activationId : matchName(r.customer_name, name));


  const withdrawalRowsFor = (name?: string | null) =>
    (withdrawalsQ.data ?? []).filter((w) => matchName(w.customer_name, name));

  /** Total withdrawn for a client — subtracted from the shown balance. */
  const withdrawalsFor = (name?: string | null) =>
    withdrawalRowsFor(name).reduce((a, w) => a + toDisplay(w.amount, w.currency), 0);

  /** Base balance + deposits - withdrawals. */
  const netBalance = (r: { id?: string | null; lead_name?: string | null; balance?: number | string | null }) =>
    Number(r.balance || 0) + depositsFor(r.lead_name, r.id) - withdrawalsFor(r.lead_name);

  const contactDatesFor = (name?: string | null, activationId?: string | null) =>
    (commsQ.data ?? [])
      .filter((c) => (c.activation_id ? c.activation_id === activationId : matchName(c.client_name, name)))
      .map((c) => c.occurred_at);

  const lastContactFor = (r: any) => lastDate(contactDatesFor(r.lead_name, r.id));

  /** Which value band a client falls into, using the company thresholds. */
  const tierOf = (r: any) => valueTier(r.potential_value, settings);

  /** No deposit and no contact in the 14 days after the FTD date. */
  const neglected = (r: any) =>
    isNeglected({
      startDate: actDate(r),
      depositDates: depositRowsFor(r.lead_name, r.id).map((d) => d.date),
      contactDates: contactDatesFor(r.lead_name, r.id),
    });

  /**
   * Activity intelligence score per client, memoised so the table can sort and
   * filter on it without recomputing for every cell.
   */
  const healthMap = useMemo(() => {
    const m = new Map<string, ClientHealth>();
    for (const r of q.data ?? []) {
      m.set(r.id, clientHealth({
        deposits: depositRowsFor(r.lead_name, r.id).map((d: any) => ({ date: d.date, amount: toDisplay(d.amount, d.currency) })),
        withdrawals: withdrawalRowsFor(r.lead_name).map((w: any) => ({ date: w.date, amount: toDisplay(w.amount, w.currency) })),
        contactDates: contactDatesFor(r.lead_name, r.id),
        kyc: (r as any).kyc,
        potentialValue: (r as any).potential_value,
        activationDate: actDate(r),
        balance: netBalance(r),
      }));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, revenueQ.data, withdrawalsQ.data, commsQ.data]);

  const healthOf = (r: any): ClientHealth =>
    healthMap.get(r.id) ?? clientHealth({ deposits: [], withdrawals: [], contactDates: [] });

  const daysSinceFtd = (r: any) => {
    const d = actDate(r);
    if (!d) return null;
    const t = new Date(`${d}T00:00:00`).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  };

  /** Deposits made on/after activation — every one of these is an STD. */
  const stdDepositsForRow = (r: Row) => stdDepositsFor(r as any, revenueQ.data ?? []);
  const stdCountFor = (r: Row) => stdDepositsForRow(r).length;

  const employeeName = (id?: string | null) =>
    (employeesQ.data ?? []).find((e) => e.id === id)?.name ?? "—";

  // Duplicate detection: same client name recorded more than once.
  const dupNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of q.data ?? []) {
      const k = (r.lead_name ?? "").trim().toLowerCase();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  }, [q.data]);
  const isDup = (r: any) => dupNames.has((r.lead_name ?? "").trim().toLowerCase());

  const issue = routeSearch.issue;
  const retentionIds = useMemo(
    () => new Set((employeesQ.data ?? []).filter((e) => e.team === "R").map((e) => e.id)),
    [employeesQ.data],
  );
  const issueMatch = React.useCallback(
    (r: any) => {
      const name = (r.lead_name ?? "").trim();
      switch (issue) {
        case "clients-no-name":
          return !name;
        case "clients-no-potential":
          return !!name && !r.potential;
        case "clients-duplicate":
          return dupNames.has(name.toLowerCase());
        case "clients-unallocated-ftd":
          return !!r.qualified_at && !retentionIds.has(r.employee_id);
        case "clients-no-revenue":
          return (
            !!name &&
            Number(r.balance || 0) <= 0 &&
            depositsFor(r.lead_name, r.id) <= 0
          );
        default:
          return true;
      }
    },
    [issue, dupNames, deposits, retentionIds],
  );

  const passesFilters = useCallback(
    (r: any) => {
      if (issue && !issueMatch(r)) return false;
      if (answeredFilter === "yes" && !r.answered) return false;
      if (answeredFilter === "no" && r.answered) return false;
      if (potentialFilter !== "all" && (r.potential ?? "") !== potentialFilter) return false;
      if (stdFilter !== "all") {
        const isStdRow = stdCountFor(r) > 0;
        if (stdFilter === "yes" && !isStdRow) return false;
        if (stdFilter === "no" && isStdRow) return false;
      }
      if (dupOnly && !dupNames.has((r.lead_name ?? "").trim().toLowerCase())) return false;
      if (tagFilter !== "all" && !(r.tags ?? []).includes(tagFilter)) return false;
      if (Number(minPotential) > 0 && (potentialValue(r.potential_value) ?? 0) < Number(minPotential)) return false;
      if (healthFilter === "attention" && !["at-risk", "critical"].includes(healthOf(r).band)) return false;
      if (healthFilter !== "all" && healthFilter !== "attention" && healthOf(r).band !== healthFilter) return false;
      if (tierFilter === "neglected" && !(neglected(r) && tierOf(r) !== "unrated")) return false;
      if (tierFilter !== "all" && tierFilter !== "neglected" && tierOf(r) !== tierFilter) return false;
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answeredFilter, potentialFilter, stdFilter, revenueQ.data, dupOnly, dupNames, tagFilter, issue, issueMatch, tierFilter, minPotential, settings, commsQ.data, healthFilter, healthMap],
  );

  /** Every client regardless of the selected date range (used by issue deep-links). */
  const rowsAllTime = useMemo(
    () => (q.data ?? []).filter(passesFilters),
    [q.data, passesFilters],
  );

  const rows = useMemo(() => {
    const s = activeRange.start.getTime();
    const e = activeRange.end.getTime();
    const bypassDate = !!issue;
    return rowsAllTime.filter((r) => {
      const d = actDate(r);
      if (d && !bypassDate) {
        const t = new Date(d + "T00:00:00").getTime();
        if (t < s || t > e) return false;
      }
      return true;
    });
  }, [rowsAllTime, activeRange, issue]);

  const tb = useTableToolbox<any>(
    "activations",
    [
      { key: "date", label: "Date", filter: "date", value: (r: any) => (actDate(r) ? fmtDate(actDate(r)!) : "") },
      { key: "qualified", label: "Qualified", filter: "select", options: ["Qualified", "Pending"], value: (r: any) => (r.qualified_at ? "Qualified" : "Pending") },
      {
        key: "lateftd",
        label: "FTD type",
        filter: "select",
        defaultHidden: true,
        options: ["Late (retention)", "On conversion", "—"],
        value: (r: any) => (isLateRetentionFtd(r) ? "Late (retention)" : r.qualified_at ? "On conversion" : "—"),
      },
      { key: "lead", label: "Lead name", locked: true, value: (r: any) => r.lead_name ?? "" },
      { key: "source", label: "Source", filter: "select", value: (r: any) => r.daily_lead_entries?.lead_sources?.name ?? "" },
      { key: "balance", label: "Balance", filter: "none" },
      { key: "potential", label: "Potential", filter: "select", defaultHidden: true, options: ["low", "mid", "high"], value: (r: any) => r.potential ?? "" },
      { key: "potentialValue", label: "Potential $", filter: "none", defaultHidden: true },
      { key: "tier", label: "Value tier", filter: "select", defaultHidden: true, options: Object.values(TIER_LABEL), value: (r: any) => TIER_LABEL[valueTier(r.potential_value, settings)] },
      { key: "opportunity", label: "Headroom", filter: "select", defaultHidden: true, value: (r: any) => r.ai_opportunity_label ?? "" },
      { key: "health", label: "Health", filter: "select", options: Object.values(HEALTH_BAND_LABEL), value: (r: any) => HEALTH_BAND_LABEL[healthOf(r).band] },
      { key: "daysftd", label: "Days since FTD", filter: "none", defaultHidden: true },
      { key: "lastcontact", label: "Last contact", filter: "none", defaultHidden: true },
      { key: "tags", label: "Tags", defaultHidden: true, value: (r: any) => (r.tags ?? []).join(", ") },
      // NOTE: keep this list in the same order as the <th> cells below — the
      // filter row is rendered from it and shifts under the wrong header otherwise.
      { key: "std", label: "STD", filter: "none", defaultHidden: true },
      { key: "conversion", label: "Conversion agent", filter: "select", value: (r: any) => employeeName(r.conversion_employee_id) ?? "" },
      { key: "retention", label: "Retention agent", filter: "select", value: (r: any) => employeeName(r.employee_id) ?? "" },
      { key: "answered", label: "Answered", filter: "select", options: ["Answered", "Not answered"], value: (r: any) => (r.answered ? "Answered" : "Not answered") },
      { key: "status", label: "Status", filter: "select", defaultHidden: true, value: (r: any) => r.status ?? "" },
      { key: "risk", label: "Attention", filter: "select", defaultHidden: true, value: (r: any) => r.ai_risk_label ?? "" },
      { key: "age", label: "Age", defaultHidden: true, value: (r: any) => (clientAge(r) != null ? String(clientAge(r)) : "") },
      { key: "country", label: "Country", filter: "select", defaultHidden: true, value: (r: any) => r.country ?? "" },
      { key: "followup", label: "Follow-up", filter: "date", defaultHidden: true, value: (r: any) => (r.next_follow_up ? fmtDate(r.next_follow_up) : "") },
      { key: "kyc", label: "KYC", filter: "select", defaultHidden: true, options: Object.values(KYC_STATUS_LABELS), value: (r: any) => KYC_STATUS_LABELS[kycStatus(r.kyc)] },
      { key: "legacy", label: "Origin", filter: "select", defaultHidden: true, options: ["New lead", "Legacy (old CRM)"], value: (r: any) => (r.legacy ? "Legacy (old CRM)" : "New lead") },
    ],
    rows,
    { allTimeRows: rowsAllTime, allTimeKeys: ["lead"] },
  );

  const { sorted, sort, toggle, setSort } = useSort<any>(tb.filtered, {
    date: (r) => actDate(r) ?? "",
    lead: (r) => r.lead_name ?? "",
    source: (r) => r.daily_lead_entries?.lead_sources?.name ?? "",
    balance: (r) => netBalance(r),
    potential: (r) => ({ low: 1, mid: 2, high: 3 } as any)[r.potential ?? ""] ?? 0,
    potentialValue: (r) => potentialValue(r.potential_value) ?? -1,
    tier: (r) => TIER_RANK[valueTier(r.potential_value, settings)],
    opportunity: (r) => Number(r.ai_opportunity_score ?? -1),
    health: (r) => HEALTH_BAND_RANK[healthOf(r).band] * 1000 + healthOf(r).score,
    daysftd: (r) => daysSinceFtd(r) ?? -1,
    lastcontact: (r) => lastContactFor(r) ?? "",
    conversion: (r) => r.conversion_employee_id ?? "",
    retention: (r) => r.employee_id ?? "",
    answered: (r) => !!r.answered,
    std: (r) => stdCountFor(r),
    status: (r) => r.status ?? "",
    kyc: (r) => ({ complete: 3, partial: 2, missing: 1 } as any)[kycStatus(r.kyc)],
    risk: (r) => Number(r.ai_risk_score ?? -1),
    age: (r) => clientAge(r) ?? -1,
    country: (r) => r.country ?? "",
    followup: (r) => r.next_follow_up ?? "",
  });
  const { pageItems, ...pg } = usePagination(sorted, 25, "activations");
  const navIndex = viewing ? pageItems.findIndex((r) => r.id === viewing.id) : -1;

  const totalBalance = rows.reduce(
    (a, r) => a + netBalance(r),
    0,
  );

  const answeredCount = rows.filter((r) => r.answered).length;
  const highCount = rows.filter((r) => r.potential === "high").length;
  const tierCounts = rows.reduce((acc: Record<string, number>, r: any) => {
    const t = tierOf(r);
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const attentionCount = rows.filter((r) => ["at-risk", "critical"].includes(healthOf(r).band)).length;
  const upsellCount = rows.filter((r) => healthOf(r).band === "upsell").length;
  const neglectedCount = rows.filter((r) => neglected(r) && tierOf(r) !== "unrated").length;




  const save = useMutation({
    mutationFn: async (v: Row) => {
      const payload = {
        lead_name: v.lead_name?.trim() || null,
        balance: Number(v.balance) || 0,
        legacy: !!v.legacy,
        potential: v.potential,
        answered: v.answered,
        employee_id: v.employee_id,
        conversion_employee_id: v.conversion_employee_id || null,
        notes: v.notes?.trim() || null,
        tags: v.tags ?? [],
        date_of_birth: v.date_of_birth || null,
        age: v.age ?? null,
        gender: v.gender || null,
        country: v.country?.trim() || null,
        city: v.city?.trim() || null,
        language: v.language?.trim() || null,
        phone: v.phone?.trim() || null,
        email: v.email?.trim() || null,
        occupation: v.occupation?.trim() || null,
        status: v.status || null,
        next_follow_up: v.next_follow_up || null,
        preferred_contact_time: v.preferred_contact_time || null,
        potential_value: v.potential_value ?? null,
        net_worth: v.net_worth ?? null,
        liquid_funds: v.liquid_funds ?? null,
        monthly_income: v.monthly_income ?? null,
        exposure_elsewhere: v.exposure_elsewhere ?? null,
        source_of_funds: v.source_of_funds?.trim() || null,
        deposit_appetite: v.deposit_appetite ?? null,
      } as any;
      if (!v.id) {
        const { error } = await supabase.from("daily_lead_activations").insert({
          ...payload,
          activated_count: 1,
          activation_date: v.activation_date || todayISO(),
        } as any);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("daily_lead_activations")
        .update(payload)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      qc.invalidateQueries({ queryKey: ["daily-lead-activations"] });
      toast.success("Saved");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });


  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const bulkUpdate = useMutation({
    mutationFn: async (patch: { answered?: boolean; potential?: string; employee_id?: string | null; conversion_employee_id?: string | null }) => {
      const ids = [...selected];
      if (!ids.length) return 0;
      const { error } = await supabase.from("daily_lead_activations").update(patch as any).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      qc.invalidateQueries({ queryKey: ["daily-lead-activations"] });
      setSelected(new Set());
      if (count) toast.success(`Updated ${count} client${count === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  /** Share the selected clients out evenly across the active retention agents. */
  const distributeRetention = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      const agents = (employeesQ.data ?? []).filter((e) => e.active !== false && e.team === "R");
      if (!ids.length) return 0;
      if (!agents.length) throw new Error("No active retention agents — add one on the Employees page first.");
      // Round-robin keeps the split even and predictable.
      const buckets = new Map<string, string[]>();
      ids.forEach((id, i) => {
        const agent = agents[i % agents.length]!.id;
        buckets.set(agent, [...(buckets.get(agent) ?? []), id]);
      });
      for (const [agentId, group] of buckets) {
        const { error } = await supabase
          .from("daily_lead_activations")
          .update({ employee_id: agentId })
          .in("id", group);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      qc.invalidateQueries({ queryKey: ["daily-lead-activations"] });
      setSelected(new Set());
      if (count) toast.success(`Allocated ${count} client${count === 1 ? "" : "s"} across retention agents`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  /** One-click assignment from the client detail sheet. */
  const assignRetention = useMutation({
    mutationFn: async (v: { id: string; employee_id: string | null }) => {
      const { error } = await supabase
        .from("daily_lead_activations")
        .update({ employee_id: v.employee_id } as any)
        .eq("id", v.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      qc.invalidateQueries({ queryKey: ["daily-lead-activations"] });
      toast.success("Retention agent updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: async (idsArg?: string[]) => {
      const ids = idsArg ?? [...selected];
      if (!ids.length) return 0;
      const { error } = await supabase.from("daily_lead_activations").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      qc.invalidateQueries({ queryKey: ["daily-lead-activations"] });
      setSelected(new Set());
      setViewing(null);
      setEditing(null);
      if (count) toast.success(`Deleted ${count} client${count === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  /**
   * Merge duplicate client records: everything attached to the extra rows is
   * repointed at the keeper (the oldest activation), then the extras go away.
   */
  const mergeClients = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      if (ids.length < 2) throw new Error("Pick at least two clients to merge");
      const picked = (rowsAllTime as any[]).filter((r) => ids.includes(r.id));
      const keeper = [...picked].sort((a, b) =>
        String(actDate(a) ?? a.created_at).localeCompare(String(actDate(b) ?? b.created_at)),
      )[0];
      if (!keeper) throw new Error("Could not find the records to merge");
      const losers = ids.filter((id) => id !== keeper.id);

      for (const [table, col] of [
        ["revenue", "activation_id"],
        ["client_communications", "activation_id"],
        ["tasks", "activation_id"],
        ["notifications", "lead_activation_id"],
      ] as const) {
        const { error } = await supabase.from(table).update({ [col]: keeper.id } as any).in(col, losers);
        if (error) throw error;
      }

      // Keep the richest profile: fill blanks on the keeper from the extras.
      const fill: Record<string, unknown> = {};
      const fields = ["phone", "email", "country", "city", "language", "occupation", "gender",
        "date_of_birth", "potential", "potential_value", "notes", "status", "conversion_employee_id", "employee_id"];
      for (const f of fields) {
        if (keeper[f] == null || keeper[f] === "") {
          const donor = picked.find((r) => r.id !== keeper.id && r[f] != null && r[f] !== "");
          if (donor) fill[f] = donor[f];
        }
      }
      const balance = picked.reduce((a, r) => a + Number(r.balance || 0), 0);
      const { error: upErr } = await supabase
        .from("daily_lead_activations")
        .update({ ...fill, balance } as any)
        .eq("id", keeper.id);
      if (upErr) throw upErr;

      const { error: delErr } = await supabase.from("daily_lead_activations").delete().in("id", losers);
      if (delErr) throw delErr;
      return { keeper: keeper.lead_name as string, merged: losers.length };
    },
    onSuccess: ({ keeper, merged }) => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      qc.invalidateQueries({ queryKey: ["daily-lead-activations"] });
      qc.invalidateQueries({ queryKey: ["revenue-for-activations"] });
      setSelected(new Set());
      toast.success(`Merged ${merged} record${merged === 1 ? "" : "s"} into ${keeper || "the keeper"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAnswered = useMutation({
    mutationFn: async ({ id, answered }: { id: string; answered: boolean }) => {
      const { error } = await supabase.from("daily_lead_activations").update({ answered }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activated-leads"] }),
    onError: (e: any) => toast.error(e.message),
  });

  // Quick status change from the client detail dialog.
  const setStatus = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { answered?: boolean; potential?: Row["potential"]; activation_date?: string; qualified_at?: string | null } }) => {
      const { error } = await supabase.from("daily_lead_activations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Every client with its balance, potential, agents and answer status."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Today: {fmtDate(todayISO())}
            </Badge>
            <Button
              variant="outline"
              onClick={() =>
                setEditing({
                  id: "",
                  entry_id: "",
                  employee_id: "",
                  conversion_employee_id: null,
                  activated_count: 1,
                  lead_name: "",
                  balance: 0,
                  potential: null,
                  answered: false,
                  activation_date: todayISO(),
                  legacy: true,
                  notes: null,
                  tags: [],
                })
              }
            >
              <Plus className="h-4 w-4" /> Add client
            </Button>
          </div>
        }
      />

      {issue && (
        <IssueFilterBanner
          issue={issue}
          count={rows.length}
          onClear={() => navigate({ search: (prev: any) => ({ ...prev, issue: undefined }), replace: true })}
        />
      )}



      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangePicker
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
        />
        <Select value={answeredFilter} onValueChange={(v) => setAnsweredFilter(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All answers</SelectItem>
            <SelectItem value="yes">Answered</SelectItem>
            <SelectItem value="no">Not answered</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stdFilter} onValueChange={(v) => setStdFilter(v as any)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            <SelectItem value="yes">STD only</SelectItem>
            <SelectItem value="no">No STD</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={dupOnly ? "default" : "outline"}
          className="h-9"
          onClick={() => setDupOnly((v) => !v)}
        >
          <Copy className="h-4 w-4" /> Duplicates{dupNames.size > 0 ? ` (${dupNames.size})` : ""}
        </Button>
        <Select value={potentialFilter} onValueChange={setPotentialFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All potentials</SelectItem>
            {POTENTIALS.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All value tiers</SelectItem>
            {VALUE_TIERS.map((t) => (
              <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
            ))}
            <SelectItem value="neglected">Neglected (any tier)</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={0}
          className="h-9 w-40"
          placeholder="Min potential $"
          value={minPotential}
          onChange={(e) => setMinPotential(e.target.value)}
        />
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {CLIENT_TAGS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={retentionFilter} onValueChange={setRetentionFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All retention agents</SelectItem>
            <SelectItem value="unassigned">Unassigned only</SelectItem>
            {(employeesQ.data ?? []).filter((e) => e.team === "R").map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(answeredFilter !== "all" || healthFilter !== "all" || tierFilter !== "all" || potentialFilter !== "all" || stdFilter !== "all" || tagFilter !== "all" || retentionFilter !== "all" || dupOnly || minPotential) && (

          <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 mb-6">
        <KpiCard
          label="Clients"
          value={String(rows.length)}
          icon={CheckCircle2}
          hint="Clients matching your filters in this period. Click to clear all filters."
          onClick={clearFilters}
        />
        <KpiCard
          label="Total balance"
          value={fmtMoney(totalBalance)}
          icon={Wallet}
          hint="Deposits minus withdrawals across these clients. Click to sort by balance."
          active={sort?.key === "balance"}
          onClick={() =>
            setSort((s) =>
              s?.key === "balance" ? (s.dir === "desc" ? { key: "balance", dir: "asc" } : null) : { key: "balance", dir: "desc" },
            )
          }
        />
        <KpiCard
          label="Answered"
          value={`${answeredCount} / ${rows.length}`}
          icon={PhoneCall}
          hint="Clients the retention agent has spoken to. Click to cycle the answer filter."
          active={answeredFilter !== "all"}
          activeLabel={answeredFilter === "no" ? "Not answered" : answeredFilter === "yes" ? "Answered" : undefined}
          onClick={() => setAnsweredFilter((v) => (v === "all" ? "no" : v === "no" ? "yes" : "all"))}
        />
        <KpiCard
          label="Needs attention"
          value={String(attentionCount)}
          icon={PhoneCall}
          hint="Clients scoring under 60 on health — at risk or critical. Click to list only them."
          active={healthFilter === "attention"}
          onClick={() => setHealthFilter((v) => (v === "attention" ? "all" : "attention"))}
        />
        <KpiCard
          label="Upsell ready"
          value={String(upsellCount)}
          icon={Wallet}
          hint="Healthy clients with real headroom left against their potential. Click to list them."
          active={healthFilter === "upsell"}
          onClick={() => setHealthFilter((v) => (v === "upsell" ? "all" : "upsell"))}
        />
        <KpiCard
          label="Whales"
          value={String(tierCounts["whale"] ?? 0)}
          icon={Wallet}
          hint={`Potential of ${fmtMoney(settings.whaleThreshold)}+ — your top clients. Click to list them.`}
          active={tierFilter === "whale"}
          onClick={() => setTierFilter((v) => (v === "whale" ? "all" : "whale"))}
        />
        <KpiCard
          label="High value"
          value={String(tierCounts["high"] ?? 0)}
          icon={Wallet}
          hint={`Potential between ${fmtMoney(settings.highThreshold)} and ${fmtMoney(settings.whaleThreshold)}. Click to list them.`}
          active={tierFilter === "high"}
          onClick={() => setTierFilter((v) => (v === "high" ? "all" : "high"))}
        />
        <KpiCard
          label="Mid value"
          value={String(tierCounts["mid"] ?? 0)}
          icon={Wallet}
          hint={`Potential between ${fmtMoney(settings.midThreshold)} and ${fmtMoney(settings.highThreshold)}. Click to list them.`}
          active={tierFilter === "mid"}
          onClick={() => setTierFilter((v) => (v === "mid" ? "all" : "mid"))}
        />
        <KpiCard
          label="Unrated"
          value={String(tierCounts["unrated"] ?? 0)}
          icon={Wallet}
          hint="No potential set yet. Click to see who needs a rating."
          active={tierFilter === "unrated"}
          onClick={() => setTierFilter((v) => (v === "unrated" ? "all" : "unrated"))}
        />
        <KpiCard
          label="Neglected clients"
          value={String(neglectedCount)}
          icon={PhoneCall}
          hint={`No deposit and no contact for the full ${NEGLECT_WINDOW_DAYS} days after FTD. Only counted once the window has fully passed. Click to act.`}
          active={tierFilter === "neglected"}
          onClick={() => setTierFilter((v) => (v === "neglected" ? "all" : "neglected"))}
        />
      </div>



      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {selected.size < sorted.length && (
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0"
              onClick={() => setSelected(new Set(sorted.map((r: any) => r.id)))}
            >
              Select all {sorted.length} matching filters
            </Button>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="outline" disabled={bulkUpdate.isPending} onClick={() => bulkUpdate.mutate({ answered: true })}>
            Mark answered
          </Button>
          <Button size="sm" variant="outline" disabled={bulkUpdate.isPending} onClick={() => bulkUpdate.mutate({ answered: false })}>
            Mark unanswered
          </Button>
          <Select onValueChange={(v) => bulkUpdate.mutate({ potential: v })}>
            <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Set potential" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="mid">Mid</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => bulkUpdate.mutate({ employee_id: v === "none" ? null : v })}>
            <SelectTrigger className="h-8 w-[190px]"><SelectValue placeholder="Set retention agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {(employeesQ.data ?? []).filter((e) => e.active !== false && e.team === "R").map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={distributeRetention.isPending}
            onClick={() => distributeRetention.mutate()}
            title="Share the selected clients evenly across active retention agents"
          >
            Allocate evenly
          </Button>

          <Select onValueChange={(v) => bulkUpdate.mutate({ conversion_employee_id: v === "none" ? null : v })}>
            <SelectTrigger className="h-8 w-[195px]"><SelectValue placeholder="Set conversion agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {(employeesQ.data ?? []).filter((e) => e.active !== false && e.team === "C").map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected.size > 1 && (
            <ConfirmDelete
              text={`Merge ${selected.size}`}
              className="border border-border bg-transparent text-foreground hover:bg-accent"
              disabled={mergeClients.isPending}
              onConfirm={() => mergeClients.mutate()}
              label={`Merge ${selected.size} client records?`}
              description="Deposits, withdrawals, tasks and notes move onto the oldest record, balances are added together, and the extra records are removed. This can't be undone."
              confirmText="Merge"
            />
          )}
          <ConfirmDelete
            text={`Delete ${selected.size}`}
            disabled={bulkDelete.isPending}
            onConfirm={() => bulkDelete.mutate(undefined)}
            label={`Delete ${selected.size} client${selected.size === 1 ? "" : "s"}?`}
            description="The client records are removed permanently. Deposits and withdrawals stay in Revenue and Withdrawals."
            confirmText={`Delete ${selected.size}`}
          />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <ActivatedLeadsByEmployee
        start={activeRange.start}
        end={activeRange.end}
        label={activeRange.label}
      />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <PageSizeSelect value={pg.perPage} onChange={pg.setPerPage} />
        <div className="flex items-center gap-2">
          <FitToggle tb={tb} />
          <TableKeyboardHint />
          <ColumnsMenu tb={tb} />
        </div>
      </div>

      <TableFrame fit={tb.fit} resizeKey="clients">
        {q.isLoading ? (
          <TableSkeleton cols={9} />
        ) : rows.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No clients" description="Activated leads logged on the Leads page appear here." />
        ) : (
          <>
          <DataCardList>
            {pageItems.map((r: any) => (
              <DataCard
                key={r.id}
                title={r.lead_name || "—"}
                subtitle={actDate(r) ? fmtDate(actDate(r)!) : undefined}
                onClick={() => setViewing(r)}
                fields={[
                  { label: "Balance", value: <span className="num">{fmtMoney(netBalance(r))}</span> },
                  { label: "Health", value: <HealthBadge health={healthOf(r)} /> },
                  { label: "Potential", value: <PotentialBadge value={r.potential} /> },
                  { label: "Tags", value: <TagBadges tags={r.tags} /> },
                  { label: "Source", value: r.daily_lead_entries?.lead_sources?.name ?? "—" },
                  { label: "STD", value: <StdBadge count={stdCountFor(r)} /> },
                  { label: "Answered", value: <AnsweredBadge answered={!!r.answered} /> },
                ]}
              />
            ))}
          </DataCardList>
          <div className="hidden md:block">
          <table className="w-full table-auto text-xs">
            <thead className="table-head bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2.5 px-2 w-10 pin-left left-0">
                  <Checkbox
                    checked={pageItems.length > 0 && pageItems.every((r: any) => selected.has(r.id))}
                    onCheckedChange={(c) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        pageItems.forEach((r: any) => (c ? next.add(r.id) : next.delete(r.id)));
                        return next;
                      })
                    }
                    aria-label="Select all on page"
                  />
                </th>
                <th className="py-3 px-2 w-8 pin-left left-9"></th>
                {tb.show("date") && <SortTh label="Date" k="date" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("qualified") && <th className="py-2.5 px-2">Qualified</th>}
                {tb.show("lateftd") && <th className="py-2.5 px-2">FTD type</th>}
                {tb.show("lead") && <SortTh label="Lead name" k="lead" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("source") && <SortTh label="Source" k="source" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("balance") && <SortTh label="Balance" k="balance" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("potential") && <SortTh label="Potential" k="potential" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("potentialValue") && <SortTh label="Potential $" k="potentialValue" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("tier") && <SortTh label="Value tier" k="tier" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("opportunity") && <SortTh label="Headroom" k="opportunity" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("health") && <SortTh label="Health" k="health" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("daysftd") && <SortTh label="Days since FTD" k="daysftd" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("lastcontact") && <SortTh label="Last contact" k="lastcontact" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("tags") && <th className="py-2.5 px-2">Tags</th>}
                {tb.show("std") && <SortTh label="STD" k="std" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("conversion") && <SortTh label="Conversion agent" k="conversion" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("retention") && <SortTh label="Retention agent" k="retention" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("answered") && <SortTh label="Answered" k="answered" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("status") && <SortTh label="Status" k="status" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("risk") && <SortTh label="Attention" k="risk" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("age") && <SortTh label="Age" k="age" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("country") && <SortTh label="Country" k="country" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("followup") && <SortTh label="Follow-up" k="followup" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("kyc") && <SortTh label="KYC" k="kyc" sort={sort} toggle={toggle} className="py-2.5 px-2" />}
                {tb.show("legacy") && <th className="py-2.5 px-2">Origin</th>}
                <th className="py-3 px-2 w-10 text-right"></th>
              </tr>
              <FilterRow tb={tb} leading={2} trailing={1} leadingClasses={["pin-left left-0", "pin-left left-9"]} />
            </thead>
            <tbody>
              {pageItems.map((r: any) => (
                <tr
                  key={r.id}
                  className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                  onClick={() => setViewing(r)}
                >
                  <td className="py-2.5 px-2 pin-left left-0" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelected(r.id)} aria-label="Select client" />
                  </td>
                  <td className="py-3 px-2 pin-left left-9" onClick={(e) => e.stopPropagation()}>
                    <FavoriteStar type="client" id={r.id} label={r.lead_name} />
                  </td>
                  {tb.show("date") && (
                  <td className="py-2.5 px-2">{actDate(r) ? fmtDate(actDate(r)!) : "—"}</td>
                  )}
                  {tb.show("qualified") && (
                  <td className="py-2.5 px-2">
                    {r.qualified_at ? (
                      <span className="text-primary">
                        {fmtDate(r.qualified_at)}
                        {isLateRetentionFtd(r) && (
                          <LateFtdBadge
                            className="ml-2"
                            activationDate={actDate(r)}
                            qualifiedAt={r.qualified_at}
                            months={monthsLate(r)}
                          />
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    )}
                  </td>
                  )}
                  {tb.show("lateftd") && (
                  <td className="py-2.5 px-2 text-xs text-muted-foreground">
                    {isLateRetentionFtd(r) ? "Late (retention)" : r.qualified_at ? "On conversion" : "—"}
                  </td>
                  )}
                  {tb.show("lead") && (
                  <td className="py-2.5 px-2 font-medium">
                    <Link
                      to="/clients/$id"
                      params={{ id: r.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-primary hover:underline"
                    >
                      {r.lead_name || "—"}
                    </Link>
                    {r.legacy && (
                      <Badge variant="outline" className="ml-2 border-muted-foreground/40 text-muted-foreground">
                        Legacy
                      </Badge>
                    )}
                    {isDup(r) && (
                      <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-600 dark:text-amber-400">
                        Duplicate
                      </Badge>
                    )}
                  </td>
                  )}
                  {tb.show("source") && (
                  <td className="py-2.5 px-2">{r.daily_lead_entries?.lead_sources?.name ?? "—"}</td>
                  )}
                  {tb.show("balance") && (
                  <td className="py-2.5 px-2">
                    {fmtMoney(netBalance(r))}
                    {(depositsFor(r.lead_name, r.id) > 0 || withdrawalsFor(r.lead_name) > 0) && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (base {fmtMoney(Number(r.balance || 0))}
                        {depositsFor(r.lead_name, r.id) > 0 && <> + {fmtMoney(depositsFor(r.lead_name, r.id))}</>}
                        {withdrawalsFor(r.lead_name) > 0 && <> − {fmtMoney(withdrawalsFor(r.lead_name))}</>})
                      </span>
                    )}
                  </td>
                  )}

                  {tb.show("potential") && (
                  <td className="py-2.5 px-2"><PotentialBadge value={r.potential} /></td>
                  )}
                  {tb.show("potentialValue") && (
                  <td className="py-2.5 px-2">
                    {potentialValue(r.potential_value) != null ? (
                      <span className="num">{fmtMoney(Number(r.potential_value))}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {neglected(r) && tierOf(r) !== "unrated" && (
                      <Badge variant="outline" className="ml-2 border-rose-500/50 text-rose-600 dark:text-rose-400">
                        Neglected
                      </Badge>
                    )}
                  </td>
                  )}
                  {tb.show("tier") && (
                  <td className="py-2.5 px-2">
                    <TierBadge value={r.potential_value} thresholds={settings} showUnrated />
                  </td>
                  )}
                  {tb.show("opportunity") && (
                  <td className="py-2.5 px-2">
                    <OpportunityBadge score={r.ai_opportunity_score} label={r.ai_opportunity_label} />
                  </td>
                  )}
                  {tb.show("health") && (
                  <td className="py-2.5 px-2"><HealthBadge health={healthOf(r)} /></td>
                  )}
                  {tb.show("daysftd") && (
                  <td className="py-2.5 px-2">{daysSinceFtd(r) ?? "—"}</td>
                  )}
                  {tb.show("lastcontact") && (
                  <td className="py-2.5 px-2">{lastContactFor(r) ? fmtDate(lastContactFor(r)!) : "—"}</td>
                  )}
                  {tb.show("tags") && (
                  <td className="py-2.5 px-2"><TagBadges tags={r.tags} /></td>
                  )}
                  {tb.show("std") && (
                  <td className="py-2.5 px-2"><StdBadge count={stdCountFor(r)} /></td>
                  )}
                  {tb.show("conversion") && (
                  <td className="py-2.5 px-2"><EmployeeLink id={r.conversion_employee_id} name={employeeName(r.conversion_employee_id)} /></td>
                  )}
                  {tb.show("retention") && (
                  <td className="py-2.5 px-2"><EmployeeLink id={r.employee_id} name={employeeName(r.employee_id)} /></td>
                  )}
                  {tb.show("answered") && (
                  <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={r.answered}
                      onCheckedChange={(c) => toggleAnswered.mutate({ id: r.id, answered: Boolean(c) })}
                    />
                  </td>
                  )}
                  {tb.show("status") && (
                  <td className="py-2.5 px-2"><StatusBadge status={r.status} /></td>
                  )}
                  {tb.show("risk") && (
                  <td className="py-2.5 px-2"><RiskBadge score={r.ai_risk_score} label={r.ai_risk_label} /></td>
                  )}
                  {tb.show("age") && (
                  <td className="py-2.5 px-2">{clientAge(r) ?? "—"}</td>
                  )}
                  {tb.show("country") && (
                  <td className="py-2.5 px-2">{r.country || "—"}</td>
                  )}
                  {tb.show("followup") && (
                  <td className="py-2.5 px-2">{r.next_follow_up ? fmtDate(r.next_follow_up) : "—"}</td>
                  )}
                  {tb.show("kyc") && (
                  <td className="py-2.5 px-2"><KycBadge value={r.kyc} /></td>
                  )}
                  {tb.show("legacy") && (
                  <td className="py-2.5 px-2 text-xs text-muted-foreground">
                    {r.legacy ? "Legacy (old CRM)" : "New lead"}
                  </td>
                  )}
                  <td className="py-3 px-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <ConfirmDelete
                      onConfirm={() => bulkDelete.mutate([r.id])}
                      label={`Delete ${r.lead_name || "this client"}?`}
                      description="The client record is removed permanently. Deposits and withdrawals stay in Revenue and Withdrawals."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </TableFrame>
      {!q.isLoading && rows.length > 0 && <TablePagination {...pg} />}



      <Sheet open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        {viewing && (() => {
          const cur = (q.data ?? []).find((r) => r.id === viewing.id) ?? viewing;
          const deposits = depositRowsFor(cur.lead_name, cur.id);
          const wds = withdrawalRowsFor(cur.lead_name);
          const baseCcy = getDisplayCurrency();
          const depositTotal = deposits.reduce((a, d) => a + toDisplay(d.amount, (d as any).currency), 0);
          const wdTotal = wds.reduce((a, d) => a + toDisplay(d.amount, d.currency), 0);
          const grossBalance = Number(cur.balance || 0) + depositTotal;
          const effective = grossBalance - wdTotal;
          const qualifies = qualifiesAsFtd(cur, grossBalance, settings);

          // Every money movement in the account, oldest first, with a running balance.
          const txs = [
            ...deposits.map((d) => ({
              date: d.date,
              kind: "deposit" as const,
              label: d.notes ? `Deposit — ${d.notes}` : "Deposit",
              delta: toDisplay(d.amount, (d as any).currency),
            })),
            ...wds.map((w) => ({
              date: w.date,
              kind: "withdrawal" as const,
              label: w.notes ? `Withdrawal — ${w.notes}` : "Withdrawal",
              delta: -toDisplay(w.amount, w.currency),
            })),
          ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

          let running = Number(cur.balance || 0);
          const txEvents = txs.map((t) => {
            running += t.delta;
            return { date: t.date, kind: t.kind, label: t.label, amount: Math.abs(t.delta), balance: running };
          });

          const timelineEvents = [
            ...(cur.daily_lead_entries?.entry_date
              ? [{ date: cur.daily_lead_entries.entry_date, kind: "lead" as const, label: "Lead received" }]
              : []),
            ...(actDate(cur)
              ? [{
                  date: actDate(cur)!,
                  kind: "activation" as const,
                  label: "Activated — opening balance",
                  amount: Number(cur.balance || 0),
                  balance: Number(cur.balance || 0),
                }]
              : []),
            ...txEvents,
          ] satisfies TimelineEvent[];
          return (
            <SheetContent
              side="right"
              className="inset-x-0 bottom-0 left-0 top-auto flex h-[92vh] w-full flex-col gap-0 overflow-y-auto rounded-t-2xl border-l-0 border-t p-4 scroll-slim data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-w-xl sm:rounded-none sm:border-l sm:border-t-0 sm:p-6 sm:data-[state=closed]:slide-out-to-right sm:data-[state=open]:slide-in-from-right"
            >
              <SheetHeader>
                <div className="flex items-center justify-between pr-8">
                  <span className="text-xs text-muted-foreground">
                    {navIndex >= 0 ? `Client ${navIndex + 1} of ${pageItems.length} on this page` : "Client"}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={navIndex <= 0}
                      onClick={() => { const p = pageItems[navIndex - 1]; if (p) setViewing(p); }}
                      aria-label="Previous client"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={navIndex < 0 || navIndex >= pageItems.length - 1}
                      onClick={() => { const n = pageItems[navIndex + 1]; if (n) setViewing(n); }}
                      aria-label="Next client"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <SheetTitle className="flex items-center gap-2">
                  <FavoriteStar type="client" id={cur.id} label={cur.lead_name} />
                  {cur.lead_name || "Unnamed client"}
                  <PotentialBadge value={cur.potential} />
                  <TierBadge value={cur.potential_value} thresholds={settings} showUnrated />
                  <OpportunityBadge score={cur.ai_opportunity_score} label={cur.ai_opportunity_label} />
                  <AnsweredBadge answered={!!cur.answered} />
                </SheetTitle>
              </SheetHeader>

              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Balance" value={fmtMoney(effective)} />
                  <Stat label="Withdrawals" value={fmtMoney(wdTotal)} />
                </div>

                <div className="grid gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
                  <Info label="Source" value={cur.daily_lead_entries?.lead_sources?.name ?? "—"} />
                  <Info label="Activation date" value={actDate(cur) ? fmtDate(actDate(cur)!) : "—"} />
                  <Info label="Lead received" value={cur.daily_lead_entries?.entry_date ? fmtDate(cur.daily_lead_entries.entry_date) : "—"} />
                  <Info label="Conversion agent" value={<EmployeeLink id={cur.conversion_employee_id} name={employeeName(cur.conversion_employee_id)} />} />
                  <Info label="Retention agent" value={<EmployeeLink id={cur.employee_id} name={employeeName(cur.employee_id)} />} />
                  <Info label="Deposit count" value={String(deposits.length)} />
                  <Info label="STD" value={<StdBadge count={stdDepositsForRow(cur).length} />} />
                  <Info label="FTD status" value={<Badge variant={qualifies ? "default" : "secondary"}>{qualifies ? "Qualified" : "Pending"}</Badge>} />
                  <Info label="Potential value" value={potentialValue(cur.potential_value) != null ? fmtMoney(Number(cur.potential_value)) : "—"} />
                  <Info label="Last contact" value={lastContactFor(cur) ? fmtDate(lastContactFor(cur)!) : "—"} />
                  <Info label="Tags" value={<TagBadges tags={cur.tags} />} />
                </div>

                <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <span className="text-xs uppercase text-muted-foreground">Potential</span>
                    <Select
                      value={cur.potential ?? "_none"}
                      onValueChange={(v) =>
                        setStatus.mutate({ id: cur.id, patch: { potential: v === "_none" ? null : (v as Row["potential"]) } })
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Set potential" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Not set</SelectItem>
                        {POTENTIALS.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-xs uppercase text-muted-foreground">Answered</span>
                    <Select
                      value={cur.answered ? "yes" : "no"}
                      onValueChange={(v) => setStatus.mutate({ id: cur.id, patch: { answered: v === "yes" } })}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Answered</SelectItem>
                        <SelectItem value="no">Unanswered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-xs uppercase text-muted-foreground">Activation date</span>
                    <Input
                      type="date"
                      className="h-9"
                      defaultValue={cur.activation_date ?? ""}
                      key={`act-${cur.id}-${cur.activation_date ?? ""}`}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) setStatus.mutate({ id: cur.id, patch: { activation_date: v } });
                      }}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-xs uppercase text-muted-foreground">Qualified date</span>
                    <Input
                      type="date"
                      className="h-9"
                      defaultValue={cur.qualified_at ? String(cur.qualified_at).slice(0, 10) : ""}
                      key={`qual-${cur.id}-${cur.qualified_at ?? ""}`}
                      onChange={(e) =>
                        setStatus.mutate({ id: cur.id, patch: { qualified_at: e.target.value || null } })
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    FTD status is derived: answered + (mid/high potential or balance of ${settings.ftdBalanceThreshold}+).
                    Qualified date drives which month the conversion commission is paid in.
                  </p>
                </div>


                <div>
                  <h3 className="mb-2 text-sm font-semibold">Lifecycle</h3>
                  <ClientTimeline events={timelineEvents} />
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Notes</h3>
                  <p className="whitespace-pre-wrap rounded-lg border border-border p-3 text-sm text-muted-foreground">
                    {cur.notes?.trim() || "No notes yet — add them from Edit client."}
                  </p>
                </div>

                <ClientCommunications activationId={cur.id} clientName={cur.lead_name} />


                <div>
                  <h3 className="mb-2 text-sm font-semibold">Deposits</h3>
                  {deposits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No deposits recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto scroll-slim rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="py-2 px-3 font-medium">Date</th>
                            <th className="py-2 px-3 font-medium">Amount</th>
                            <th className="py-2 px-3 font-medium">STD</th>
                            <th className="py-2 px-3 font-medium">Agent</th>
                            <th className="py-2 px-3 font-medium">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deposits.map((d) => (
                            <tr key={d.id} className="border-t border-border/50">
                              <td className="py-2 px-3">{fmtDate(d.date)}</td>
                              <td className="py-2 px-3 num font-medium">{fmtMoney(d.amount)}</td>
                              <td className="py-2 px-3">
                                {(() => {
                                  const act = activationDate(cur as any);
                                  return !act || (d.date && d.date >= act)
                                    ? <Badge variant="default">STD</Badge>
                                    : <span className="text-muted-foreground">—</span>;
                                })()}
                              </td>
                              <td className="py-2 px-3"><EmployeeLink id={d.employee_id} name={employeeName(d.employee_id)} /></td>
                              <td className="py-2 px-3 text-muted-foreground">{d.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border bg-muted/30 font-semibold">
                            <td className="py-2 px-3">Total</td>
                            <td className="py-2 px-3 num">{fmtMoney(depositTotal)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {wds.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Withdrawals</h3>
                    <div className="overflow-x-auto scroll-slim rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="py-2 px-3 font-medium">Date</th>
                            <th className="py-2 px-3 font-medium">Amount</th>
                            <th className="py-2 px-3 font-medium">STD</th>
                            <th className="py-2 px-3 font-medium">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wds.map((w) => (
                            <tr key={w.id} className="border-t border-border/50">
                              <td className="py-2 px-3">{fmtDate(w.date)}</td>
                              <td className="py-2 px-3 num font-medium">{fmtMoney(w.amount)}</td>
                              <td className="py-2 px-3 text-muted-foreground">{w.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <AttachmentsPanel entityType="client" entityId={cur.id} />

                <CommentThread entityType="client" entityId={cur.id} />
              </div>

              <SheetFooter className="mt-4 flex-row items-center gap-2">
                <ConfirmDelete
                  text="Delete client"
                  disabled={bulkDelete.isPending}
                  onConfirm={() => bulkDelete.mutate([cur.id])}
                  label={`Delete ${cur.lead_name || "this client"}?`}
                  description="The client record is removed permanently. Deposits and withdrawals stay in Revenue and Withdrawals."
                />
                <div className="flex-1" />
                <AiClientPaste
                  current={cur as any}
                  applying={save.isPending}
                  onApply={(patch: Record<string, unknown>) => {
                    const next = { ...cur, ...(patch as any) };
                    setViewing(next as any);
                    save.mutate(next as any);
                  }}
                />
                <Button asChild variant="outline">
                  <Link to="/clients/$id" params={{ id: cur.id }}>Open full profile</Link>
                </Button>
                <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
                <Button onClick={() => { setViewing(null); setEditing(cur); }}>Edit client</Button>
              </SheetFooter>
            </SheetContent>
          );
        })()}
      </Sheet>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing && (
          <EditDialog
            key={editing.id || "new"}
            row={editing}
            employees={employeesQ.data ?? []}
            loading={save.isPending}
            onSubmit={(v) => save.mutate(v)}
            onDelete={editing.id ? () => bulkDelete.mutate([editing.id]) : undefined}
          />
        )}
      </Dialog>
    </div>
  );
}

function EditDialog({
  row, employees, loading, onSubmit, onDelete,
}: {
  row: Row;
  employees: { id: string; name: string; team?: string | null }[];
  loading: boolean;
  onSubmit: (v: Row) => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<Row>({ ...row });

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scroll-slim">
      <DialogHeader>
        <DialogTitle>{row.id ? "Client" : "Add client"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Lead name</label>
          <Input value={form.lead_name ?? ""} onChange={(e) => setForm({ ...form, lead_name: e.target.value })} />
        </div>
        {!row.id && (
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Activation date</label>
            <Input
              type="date"
              value={form.activation_date ?? todayISO()}
              onChange={(e) => setForm({ ...form, activation_date: e.target.value })}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Base balance</label>
            <Input type="number" min={0} value={form.balance ?? 0}
              onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Potential</label>
            <Select value={form.potential ?? "_none"}
              onValueChange={(v) => setForm({ ...form, potential: v === "_none" ? null : (v as Row["potential"]) })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">—</SelectItem>
                {POTENTIALS.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Potential value ($)</label>
          <Input
            type="number"
            min={0}
            step={1000}
            placeholder="e.g. 100000"
            value={form.potential_value ?? ""}
            onChange={(e) => setForm({ ...form, potential_value: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Conversion agent (Team C)</label>
          <Select value={form.conversion_employee_id || "_none"}
            onValueChange={(v) => setForm({ ...form, conversion_employee_id: v === "_none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {employees
                .filter((e) => (e.team ?? "C") === "C" || e.id === form.conversion_employee_id)
                .map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Retention agent (Team R)</label>
          <Select value={form.employee_id || "_none"}
            onValueChange={(v) => setForm({ ...form, employee_id: v === "_none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {employees
                .filter((e) => (e.team ?? "R") === "R" || e.id === form.employee_id)
                .map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Tags</label>
          <TagPicker value={form.tags ?? []} onChange={(tags) => setForm({ ...form, tags })} />
        </div>
        <div className="grid gap-2 rounded-lg border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Client details</p>
          <ClientProfileFields
            value={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
        </div>
        <div className="grid gap-2 rounded-lg border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Financial KYC</p>
          <ClientKycFields
            value={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Notes</label>
          <Textarea
            rows={3}
            placeholder="Context for this client — preferences, objections, next steps…"
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.answered} onCheckedChange={(c) => setForm({ ...form, answered: Boolean(c) })} />
          Answered
        </label>
        <label className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-2.5 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={!!form.legacy}
            onCheckedChange={(c) => setForm({ ...form, legacy: Boolean(c) })}
          />
          <span>
            Legacy client (from old CRM)
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Deposits, withdrawals and STDs still count. Not credited as an FTD to the
              conversion agent and not counted as a client received.
            </span>
          </span>
        </label>
      </div>
      <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
        {onDelete ? (
          <ConfirmDelete
            text="Delete"
            onConfirm={onDelete}
            label={`Delete ${row.lead_name || "this client"}?`}
            description="The client record is removed permanently. Deposits and withdrawals stay in Revenue and Withdrawals."
          />
        ) : (
          <span />
        )}
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.employee_id}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold num">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
