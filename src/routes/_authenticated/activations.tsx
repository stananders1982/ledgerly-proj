import { createFileRoute } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnsweredBadge, PotentialBadge as SharedPotentialBadge } from "@/components/status-badge";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { EmployeeLink } from "@/components/employee-link";
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
import { fmtDate, fmtMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { StatCard } from "@/components/stat-card";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { ActivatedLeadsByEmployee } from "@/components/activated-leads-by-employee";
import { CheckCircle2, PhoneCall, Wallet, Copy } from "lucide-react";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination, PageSizeSelect } from "@/components/pagination";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTableToolbox, ColumnsMenu, FilterRow } from "@/components/table-toolbox";
import { qualifiesAsFtd, ftdPendingReasons, stdDepositsFor, activationDate, depositIndex, depositTotalFor } from "@/lib/rules";
import { useCompanySettings } from "@/lib/settings";
import { CLIENT_TAGS, TagBadges, TagPicker } from "@/components/client-tags";
import { ClientCommunications, ClientTimeline, type TimelineEvent } from "@/components/client-activity";
import { FavoriteStar } from "@/components/favorite-star";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/confirm-delete";
import { usePersistedState } from "@/hooks/use-persisted-state";

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
  notes?: string | null;
  tags?: string[] | null;
  daily_lead_entries?: { entry_date: string; source_id: string | null; lead_sources?: { name: string } | null } | null;
};



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
        .select("id, customer_name, amount, date, notes")
        .order("date", { ascending: false }));
      return (data ?? []) as {
        id: string; customer_name: string | null; amount: number; date: string; notes: string | null;
      }[];
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
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answeredFilter, potentialFilter, stdFilter, revenueQ.data, dupOnly, dupNames, tagFilter, issue, issueMatch],
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
      { key: "qualified", label: "Qualified", filter: "select", value: (r: any) => (r.qualified_at ? "Qualified" : "Pending") },
      { key: "lead", label: "Lead name", value: (r: any) => r.lead_name ?? "" },
      { key: "source", label: "Source", filter: "select", value: (r: any) => r.daily_lead_entries?.lead_sources?.name ?? "" },
      { key: "balance", label: "Balance", filter: "none" },
      { key: "potential", label: "Potential", filter: "select", value: (r: any) => r.potential ?? "" },
      { key: "tags", label: "Tags", value: (r: any) => (r.tags ?? []).join(", ") },
      { key: "std", label: "STD", filter: "none" },
      { key: "conversion", label: "Conversion agent", filter: "select", value: (r: any) => employeeName(r.conversion_employee_id) ?? "" },
      { key: "retention", label: "Retention agent", filter: "select", value: (r: any) => employeeName(r.employee_id) ?? "" },
      { key: "answered", label: "Answered", filter: "select", value: (r: any) => (r.answered ? "Yes" : "No") },
    ],
    rows,
    { allTimeRows: rowsAllTime, allTimeKeys: ["lead"] },
  );

  const { sorted, sort, toggle } = useSort<any>(tb.filtered, {
    date: (r) => actDate(r) ?? "",
    lead: (r) => r.lead_name ?? "",
    source: (r) => r.daily_lead_entries?.lead_sources?.name ?? "",
    balance: (r) => Number(r.balance || 0) + depositsFor(r.lead_name, r.id),
    potential: (r) => ({ low: 1, mid: 2, high: 3 } as any)[r.potential ?? ""] ?? 0,
    conversion: (r) => r.conversion_employee_id ?? "",
    retention: (r) => r.employee_id ?? "",
    answered: (r) => !!r.answered,
    std: (r) => stdCountFor(r),
  });
  const { pageItems, ...pg } = usePagination(sorted, 25, "activations");
  const navIndex = viewing ? pageItems.findIndex((r) => r.id === viewing.id) : -1;

  const totalBalance = rows.reduce(
    (a, r) => a + Number(r.balance || 0) + depositsFor(r.lead_name, r.id),
    0,
  );

  const answeredCount = rows.filter((r) => r.answered).length;
  const highCount = rows.filter((r) => r.potential === "high").length;




  const save = useMutation({
    mutationFn: async (v: Row) => {
      const { error } = await supabase
        .from("daily_lead_activations")
        .update({
          lead_name: v.lead_name?.trim() || null,
          balance: Number(v.balance) || 0,
          potential: v.potential,
          answered: v.answered,
          employee_id: v.employee_id,
          conversion_employee_id: v.conversion_employee_id || null,
          notes: v.notes?.trim() || null,
          tags: v.tags ?? [],
        } as any)
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
    mutationFn: async (patch: { answered?: boolean; potential?: string }) => {
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
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {CLIENT_TAGS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 mb-6">
        <StatCard label="Clients" value={String(rows.length)} icon={CheckCircle2} />
        <StatCard label="Total balance" value={fmtMoney(totalBalance)} icon={Wallet} />
        <StatCard label="Answered" value={`${answeredCount} / ${rows.length}`} icon={PhoneCall} />
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
        <ColumnsMenu tb={tb} />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
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
                  { label: "Balance", value: <span className="num">{fmtMoney(Number(r.balance || 0) + depositsFor(r.lead_name, r.id))}</span> },
                  { label: "Potential", value: <PotentialBadge value={r.potential} /> },
                  { label: "Tags", value: <TagBadges tags={r.tags} /> },
                  { label: "Source", value: r.daily_lead_entries?.lead_sources?.name ?? "—" },
                  { label: "STD", value: <StdBadge count={stdCountFor(r)} /> },
                  { label: "Answered", value: <AnsweredBadge answered={!!r.answered} /> },
                ]}
              />
            ))}
          </DataCardList>
          <div className="hidden md:block overflow-x-auto scroll-slim">
          <table className="w-full text-sm">
            <thead className="table-head bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-3 px-4 w-10">
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
                <th className="py-3 px-2 w-8"></th>
                {tb.show("date") && <SortTh label="Date" k="date" sort={sort} toggle={toggle} className="py-3 px-4" />}
                {tb.show("qualified") && <th className="py-3 px-4">Qualified</th>}
                {tb.show("lead") && <SortTh label="Lead name" k="lead" sort={sort} toggle={toggle} className="py-3 px-4" />}
                {tb.show("source") && <SortTh label="Source" k="source" sort={sort} toggle={toggle} className="py-3 px-4" />}
                {tb.show("balance") && <SortTh label="Balance" k="balance" sort={sort} toggle={toggle} className="py-3 px-4" />}
                {tb.show("potential") && <SortTh label="Potential" k="potential" sort={sort} toggle={toggle} className="py-3 px-4" />}
                {tb.show("tags") && <th className="py-3 px-4">Tags</th>}
                {tb.show("std") && <SortTh label="STD" k="std" sort={sort} toggle={toggle} className="py-3 px-4" />}
                {tb.show("conversion") && <SortTh label="Conversion agent" k="conversion" sort={sort} toggle={toggle} className="py-3 px-4" />}
                {tb.show("retention") && <SortTh label="Retention agent" k="retention" sort={sort} toggle={toggle} className="py-3 px-4" />}
                {tb.show("answered") && <SortTh label="Answered" k="answered" sort={sort} toggle={toggle} className="py-3 px-4" />}
                <th className="py-3 px-2 w-10 text-right"></th>
              </tr>
              <FilterRow tb={tb} leading={2} trailing={1} />
            </thead>
            <tbody>
              {pageItems.map((r: any) => (
                <tr
                  key={r.id}
                  className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                  onClick={() => setViewing(r)}
                >
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelected(r.id)} aria-label="Select client" />
                  </td>
                  <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                    <FavoriteStar type="client" id={r.id} label={r.lead_name} />
                  </td>
                  {tb.show("date") && (
                  <td className="py-3 px-4">{actDate(r) ? fmtDate(actDate(r)!) : "—"}</td>
                  )}
                  {tb.show("qualified") && (
                  <td className="py-3 px-4">
                    {r.qualified_at ? (
                      <span className="text-primary">
                        {fmtDate(r.qualified_at)}
                        {String(r.qualified_at).slice(0, 7) !== String(actDate(r) ?? "").slice(0, 7) && (
                          <span className="ml-1 text-xs text-muted-foreground">(late)</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    )}
                  </td>
                  )}
                  {tb.show("lead") && (
                  <td className="py-3 px-4 font-medium">
                    {r.lead_name || "—"}
                    {isDup(r) && (
                      <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-600 dark:text-amber-400">
                        Duplicate
                      </Badge>
                    )}
                  </td>
                  )}
                  {tb.show("source") && (
                  <td className="py-3 px-4">{r.daily_lead_entries?.lead_sources?.name ?? "—"}</td>
                  )}
                  {tb.show("balance") && (
                  <td className="py-3 px-4">
                    {fmtMoney(Number(r.balance || 0) + depositsFor(r.lead_name, r.id))}
                    {depositsFor(r.lead_name, r.id) > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (base {fmtMoney(Number(r.balance || 0))} + {fmtMoney(depositsFor(r.lead_name, r.id))})
                      </span>
                    )}
                  </td>
                  )}

                  {tb.show("potential") && (
                  <td className="py-3 px-4"><PotentialBadge value={r.potential} /></td>
                  )}
                  {tb.show("tags") && (
                  <td className="py-3 px-4"><TagBadges tags={r.tags} /></td>
                  )}
                  {tb.show("std") && (
                  <td className="py-3 px-4"><StdBadge count={stdCountFor(r)} /></td>
                  )}
                  {tb.show("conversion") && (
                  <td className="py-3 px-4"><EmployeeLink id={r.conversion_employee_id} name={employeeName(r.conversion_employee_id)} /></td>
                  )}
                  {tb.show("retention") && (
                  <td className="py-3 px-4"><EmployeeLink id={r.employee_id} name={employeeName(r.employee_id)} /></td>
                  )}
                  {tb.show("answered") && (
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={r.answered}
                      onCheckedChange={(c) => toggleAnswered.mutate({ id: r.id, answered: Boolean(c) })}
                    />
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
          <TablePagination {...pg} />
          </>
        )}
      </div>



      <Sheet open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        {viewing && (() => {
          const cur = (q.data ?? []).find((r) => r.id === viewing.id) ?? viewing;
          const deposits = depositRowsFor(cur.lead_name, cur.id);
          const wds = withdrawalRowsFor(cur.lead_name);
          const depositTotal = deposits.reduce((a, d) => a + Number(d.amount || 0), 0);
          const wdTotal = wds.reduce((a, d) => a + Number(d.amount || 0), 0);
          const effective = Number(cur.balance || 0) + depositTotal;
          const qualifies = qualifiesAsFtd(cur, effective, settings);
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
                  <AnsweredBadge answered={!!cur.answered} />
                </SheetTitle>
              </SheetHeader>

              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Effective balance" value={fmtMoney(effective)} />
                  <Stat label="Base balance" value={fmtMoney(Number(cur.balance || 0))} />
                  <Stat label="Deposits" value={fmtMoney(depositTotal)} />
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
                  <ClientTimeline
                    events={[
                      ...(cur.daily_lead_entries?.entry_date
                        ? [{ date: cur.daily_lead_entries.entry_date, kind: "lead" as const, label: "Lead received" }]
                        : []),
                      ...(actDate(cur)
                        ? [{ date: actDate(cur)!, kind: "activation" as const, label: "Activated" }]
                        : []),
                      ...deposits.map((d) => ({
                        date: d.date,
                        kind: "deposit" as const,
                        label: d.notes ? `Deposit — ${d.notes}` : "Deposit",
                        amount: Number(d.amount || 0),
                      })),
                      ...wds.map((w) => ({
                        date: w.date,
                        kind: "withdrawal" as const,
                        label: w.notes ? `Withdrawal — ${w.notes}` : "Withdrawal",
                        amount: Number(w.amount || 0),
                      })),
                    ] satisfies TimelineEvent[]}
                  />
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
            key={editing.id}
            row={editing}
            employees={employeesQ.data ?? []}
            loading={save.isPending}
            onSubmit={(v) => save.mutate(v)}
            onDelete={() => bulkDelete.mutate([editing.id])}
          />
        )}
      </Dialog>
    </div>
  );
}

function EditDialog({
  row, employees, loading, onSubmit,
}: {
  row: Row;
  employees: { id: string; name: string; team?: string | null }[];
  loading: boolean;
  onSubmit: (v: Row) => void;
}) {
  const [form, setForm] = useState<Row>({ ...row });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Client</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">Lead name</label>
          <Input value={form.lead_name ?? ""} onChange={(e) => setForm({ ...form, lead_name: e.target.value })} />
        </div>
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
      </div>
      <DialogFooter>
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
