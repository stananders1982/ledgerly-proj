import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { fetchAll } from "@/lib/fetch-all";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, ExternalLink, Percent, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { useSort, SortTh } from "@/components/sortable-table";
import { usePagination, TablePagination } from "@/components/pagination";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataCard, DataCardList } from "@/components/data-card-list";
import { EmptyState } from "@/components/empty-state";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useAffiliateBalanceAlerts } from "@/lib/affiliate-alerts";
import {
  sourceToAffiliate,
  sumWeeks,
  weekStartOf,
  weeklyGuarantee,
  type AffiliateTerms,
  type BalanceActivation,
  type LeadEntryLike,
} from "@/lib/affiliate-balance";

export const Route = createFileRoute("/_authenticated/affiliates/")({
  head: () => ({
    meta: [
      { title: "Affiliates — Ledgerly" },
      { name: "description", content: "Affiliate balances with weekly conversion guarantees, payouts and amounts owed." },
      { property: "og:title", content: "Affiliates — Ledgerly" },
      { property: "og:description", content: "Affiliate balances with weekly conversion guarantees, payouts and amounts owed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AffiliatesPage,
});

type AffRow = AffiliateTerms & { active: boolean };

function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AffiliatesPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [range, setRange] = usePersistedState<RangeKey>("affiliates:range", "month");
  const [customStart, setCustomStart] = usePersistedState<string>("affiliates:range-start", "");
  const [customEnd, setCustomEnd] = usePersistedState<string>("affiliates:range-end", "");
  const activeRange = useMemo(() => getRange(range, { start: customStart, end: customEnd }), [range, customStart, customEnd]);
  // Affiliates settle Mon–Sun, so "Week" means the current settlement week, not the last 7 days.
  const startIso = range === "week" ? weekStartOf(isoOf(activeRange.end)) : isoOf(activeRange.start);
  const endIso = isoOf(activeRange.end);

  const affQ = useQuery({
    queryKey: ["affiliates-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliates")
        .select("id,name,active,cpa_rate,guarantee_value,guarantee_period,group_key,balance_start_date,opening_balance,balance_activated_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as (AffRow & BalanceActivation & { guarantee_period: string; group_key: string | null })[];
    },
  });

  const srcQ = useQuery({
    queryKey: ["affiliate-sources"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_sources").select("id,name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["affiliate-entries", startIso, endIso],
    queryFn: async () => {
      const data = await fetchAll(() =>
        supabase
          .from("daily_lead_entries")
          .select("entry_date,received,invalid,reported,activated,source_id")
          .gte("entry_date", startIso)
          .lte("entry_date", endIso),
      );
      return (data ?? []) as LeadEntryLike[];
    },
  });

  const rows = useMemo(() => {
    const map = sourceToAffiliate(srcQ.data ?? [], affQ.data ?? []);
    const entriesByAff = new Map<string, LeadEntryLike[]>();
    for (const e of entriesQ.data ?? []) {
      const affId = e.source_id ? map.get(e.source_id) : undefined;
      if (!affId) continue;
      const list = entriesByAff.get(affId) ?? [];
      list.push(e);
      entriesByAff.set(affId, list);
    }

    return (affQ.data ?? [])
      .map((a) => {
        const statWeeks = sumWeeks(weeklyGuarantee(a, entriesByAff.get(a.id) ?? []));
        return {
          id: a.id,
          name: a.name,
          active: a.active,
          groupKey: (a as { group_key?: string | null }).group_key?.trim() || null,
          price: Number(a.cpa_rate || 0),
          pct: Number(a.guarantee_value || 0),
          leads: statWeeks.leads,
          valid: statWeeks.valid,
          activated: statWeeks.activated,
          activationPct: statWeeks.activationPct,
          reportedPct: statWeeks.reportedPct,
          guaranteed: statWeeks.guaranteed,
          reported: statWeeks.reported,
        };
      })
      .filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [affQ.data, srcQ.data, entriesQ.data, search]);

  const { sorted, sort, toggle } = useSort(rows, {
    name: (r) => r.name,
    price: (r) => r.price,
    pct: (r) => r.pct,
    leads: (r) => r.leads,
    activated: (r) => r.activated,
    activationPct: (r) => r.activationPct ?? -1,
    guaranteed: (r) => r.guaranteed,
    reported: (r) => r.reported,
    reportedPct: (r) => r.reportedPct ?? -1,
  });
  const { pageItems, ...pg } = usePagination(sorted, 30, "affiliates");




  const [editing, setEditing] = useState<(AffRow & { guarantee_period?: string; group_key?: string | null }) | null>(null);
  const [form, setForm] = useState({ cpa_rate: "0", guarantee_value: "0", group_key: "", active: true });
  useEffect(() => {
    if (editing) {
      setForm({
        cpa_rate: String(Number(editing.cpa_rate || 0)),
        guarantee_value: String(Number(editing.guarantee_value || 0)),
        group_key: editing.group_key ?? "",
        active: editing.active,
      });
    }
  }, [editing]);

  const saveTerms = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("affiliates")
        .update({
          cpa_rate: Number(form.cpa_rate) || 0,
          guarantee_value: Number(form.guarantee_value) || 0,
          guarantee_type: Number(form.guarantee_value) > 0 ? "conversion_rate" : "none",
          guarantee_period: "weekly",
          group_key: form.group_key.trim() || null,
          active: form.active,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Affiliate terms updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["affiliates-list"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });


  return (
    <div>
      <PageHeader
        title="Affiliates"
        description="Weekly conversion guarantee, amounts owed and payouts per affiliate."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Search affiliates…" className="w-56" />}
      />

      <div className="mb-4">
        <DateRangePicker
          value={range}
          onChange={setRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
        />
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Money owed, payments and balances live on each affiliate&apos;s statement page.
      </p>


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
                subtitle={r.active ? `${fmtMoney(r.price)} / conversion · ${r.pct > 0 ? `${r.pct}% guarantee` : "flat, no guarantee"}` : "Inactive"}
                fields={[
                  { label: "Leads", value: <span className="num">{r.leads}</span> },
                  { label: "Valid", value: <span className="num">{r.valid}</span> },
                  { label: "FTDs", value: <span className="num">{r.activated}{r.activationPct == null ? "" : ` (${r.activationPct}%)`}</span> },
                  { label: "Guaranteed", value: <span className="num">{r.guaranteed}</span> },
                  { label: "Reported", value: <span className="num">{r.reported}{r.reportedPct == null ? "" : ` (${r.reportedPct}%)`}</span> },
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
                  <SortTh label="Price" k="price" sort={sort} toggle={toggle} />
                  <SortTh label="Guarantee %" k="pct" sort={sort} toggle={toggle} />
                  <SortTh label="Leads" k="leads" sort={sort} toggle={toggle} />
                  <SortTh label="FTDs" k="activated" sort={sort} toggle={toggle} />
                  <SortTh label="Act %" k="activationPct" sort={sort} toggle={toggle} />
                  <SortTh label="Guaranteed" k="guaranteed" sort={sort} toggle={toggle} />
                  <SortTh label="Reported" k="reported" sort={sort} toggle={toggle} />
                  <SortTh label="Rep %" k="reportedPct" sort={sort} toggle={toggle} />
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
                      {alertById.get(r.id) && (
                        <AlertTriangle
                          className="mr-1.5 inline h-3.5 w-3.5 text-amber-500 align-[-2px]"
                          aria-label="Balance near zero"
                        />
                      )}
                      {r.name}
                      {r.groupKey && (
                        <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {r.groupKey}
                        </span>
                      )}
                      {!r.active && <span className="ml-2 text-xs text-muted-foreground">inactive</span>}
                    </td>

                    <td className="py-3 px-4">{fmtMoney(r.price)}</td>
                    <td className="py-3 px-4">{r.pct}%</td>
                    <td className="py-3 px-4">{r.leads}{r.leads !== r.valid && <span className="text-muted-foreground text-xs"> ({r.valid} valid)</span>}</td>
                    <td className="py-3 px-4">{r.activated}</td>
                    <td className="py-3 px-4">{r.activationPct == null ? "—" : `${r.activationPct}%`}</td>
                    <td className="py-3 px-4">{r.guaranteed}</td>
                    <td className="py-3 px-4">{r.reported}</td>
                    <td className="py-3 px-4">{r.reportedPct == null ? "—" : `${r.reportedPct}%`}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">

                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mr-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            const aff = (affQ.data ?? []).find((a) => a.id === r.id);
                            if (aff) setEditing(aff);
                          }}
                        >
                          <Settings2 className="h-3.5 w-3.5" /> Terms
                        </Button>
                      )}

                      <Link to="/affiliates/$id" params={{ id: r.id }} className="inline-flex items-center gap-1 text-primary hover:underline text-xs" onClick={(e) => e.stopPropagation()}>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terms — {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Activation price (CPA)</Label>
                <Input type="number" min="0" step="1" value={form.cpa_rate} onChange={(e) => setForm((f) => ({ ...f, cpa_rate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><Percent className="h-3 w-3" /> Guaranteed conversion rate</Label>
                <Input type="number" min="0" max="100" step="0.1" value={form.guarantee_value} onChange={(e) => setForm((f) => ({ ...f, guarantee_value: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Settled weekly (Mon–Sun): guaranteed conversions = leads received × rate. You pay for reported
              conversions up to the guarantee; anything above it is free.
            </p>
            <div className="space-y-1.5">
              <Label>Billing group (optional)</Label>
              <Input
                placeholder="e.g. FTDhub"
                value={form.group_key}
                onChange={(e) => setForm((f) => ({ ...f, group_key: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Affiliates with the same billing group are one partner: their payouts and balance are shared,
                while each source keeps its own price and guarantee.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-muted-foreground">Inactive affiliates stay visible but are excluded from new work.</div>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveTerms.mutate()} disabled={saveTerms.isPending}>Save terms</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
