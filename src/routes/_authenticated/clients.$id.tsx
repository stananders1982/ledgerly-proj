import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Banknote, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { EmployeeLink } from "@/components/employee-link";
import { FavoriteStar } from "@/components/favorite-star";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { TagBadges, TagPicker } from "@/components/client-tags";
import { AnsweredBadge, PotentialBadge } from "@/components/status-badge";
import { ClientCommunications } from "@/components/client-activity";
import { Client360Timeline } from "@/components/client-360";
import { ClientJourney, type JourneyStage } from "@/components/client-journey";
import {
  ClientKycFields, ClientProfileFields, OpportunityBadge, RiskBadge, StatusBadge, TierBadge,
} from "@/components/client-profile-fields";
import { TIER_LABEL, isNeglected, potentialValue, valueTier } from "@/lib/whales";
import { clientHealth } from "@/lib/client-health";
import { ClientHealthCard, HealthBadge } from "@/components/client-health";
import { nextBestAction } from "@/lib/next-best-action";
import { NextBestActionCard } from "@/components/next-best-action";
import { clientAge, daysSince, type ClientProfile } from "@/lib/client-profile";
import { analyseClient } from "@/lib/client-insight.functions";
import { AiClientPaste } from "@/components/ai-client-paste";
import { ContactActions } from "@/components/contact-actions";
import { DepositRequestDialog } from "@/components/deposit-request-dialog";
import { ManualDepositDialog } from "@/components/manual-deposit-dialog";
import { ClientDepositHistory } from "@/components/client-deposit-history";

import { fmtDate, fmtMoney, getDisplayCurrency } from "@/lib/format";
import { toDisplay, fromWorkspace } from "@/lib/fx";
import { depositFee, feeTotals, leadCostPerClient } from "@/lib/profitability";
import { ClientKycChecklist, KycBadge } from "@/components/client-kyc-checklist";
import { fetchAll } from "@/lib/fetch-all";
import { qualifiesAsFtd, stdDepositsFor, activationDate } from "@/lib/rules";
import { useCompanySettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth-context";
import { useMyRoleKey } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({
    meta: [
      { title: "Client profile — Ledgerly" },
      { name: "description", content: "Full client profile: personal details, balance, deposits, withdrawals, comments and AI insight." },
      { property: "og:title", content: "Client profile — Ledgerly" },
      { property: "og:description", content: "Full client profile: personal details, balance, deposits, withdrawals, comments and AI insight." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientPage,
});

type Client = {
  id: string;
  lead_name: string | null;
  employee_id: string;
  conversion_employee_id: string | null;
  balance: number;
  potential: "low" | "mid" | "high" | null;
  answered: boolean;
  activation_date: string | null;
  qualified_at: string | null;
  legacy: boolean | null;
  notes: string | null;
  tags: string[] | null;
  daily_lead_entries?: { entry_date: string; created_at?: string | null; lead_sources?: { name: string } | null } | null;
} & ClientProfile;

const matchName = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function ClientPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const settings = useCompanySettings();
  const { user, companyId, isAdmin } = useAuth();
  const { roleKey } = useMyRoleKey();
  const canAllocate = roleKey !== "retention" && roleKey !== "agent";

  const clientQ = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_activations")
        .select("*, daily_lead_entries(entry_date, created_at, cost, activated, lead_sources(name))")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Client | null;
    },
  });

  const employeesQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active?: boolean; team?: string }[];
    },
  });

  const retentionAgentsQ = useQuery({
    queryKey: ["retention-agents", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, team, active")
        .eq("company_id", companyId!)
        .eq("active", true)
        .in("team", ["R"]);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; team: string; active: boolean }[];
    },
  });

  const name = clientQ.data?.lead_name ?? null;

  const depositsQ = useQuery({
    queryKey: ["client-deposits", id, name],
    enabled: !!clientQ.data,
    queryFn: async () => {
      const cols = "id,customer_name,amount,currency,date,created_at,notes,method,method_provider,fee_pct,fee_amount,employee_id,activation_id";
      const byActivation = await fetchAll<any>(() =>
        supabase.from("revenue").select(cols).eq("activation_id", id).order("date", { ascending: true }),
      );
      const byName = name
        ? await fetchAll<any>(() =>
            supabase.from("revenue").select(cols).is("activation_id", null).ilike("customer_name", name.trim()).order("date", { ascending: true }),
          )
        : [];
      const seen = new Set<string>();
      return [...byActivation, ...byName]
        .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
        .filter((r: any) => (r.activation_id ? r.activation_id === id : matchName(r.customer_name, name)))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    },
  });

  const withdrawalsQ = useQuery({
    queryKey: ["client-withdrawals", id, name],
    enabled: !!clientQ.data && !!name,
    queryFn: async () => {
      const rows = await fetchAll<any>(() =>
        supabase
          .from("withdrawals")
          .select("id,customer_name,amount,date,created_at,notes,employee_id")
          .ilike("customer_name", (name ?? "").trim())
          .order("date", { ascending: true }),
      );
      return rows.filter((w: any) => matchName(w.customer_name, name));
    },
  });


  const commsQ = useQuery({
    queryKey: ["client-comms", id],
    enabled: !!clientQ.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_communications")
        .select("id,channel,direction,summary,occurred_at")
        .eq("activation_id", id)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("daily_lead_activations").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", id] });
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runAnalysis = useServerFn(analyseClient);
  const analyse = useMutation({
    mutationFn: () => runAnalysis({ data: { activationId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", id] });
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      toast.success("Analysis updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not analyse this client"),
  });

  // Local draft so typing doesn't fire a write per keystroke.
  const [draft, setDraft] = useState<ClientProfile | null>(null);
  const [notes, setNotes] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  useEffect(() => {
    if (!clientQ.data) return;
    const c = clientQ.data;
    setDraft({
      potential_value: c.potential_value ?? null,
      date_of_birth: c.date_of_birth ?? null,
      age: c.age ?? null,
      gender: c.gender ?? null,
      country: c.country ?? null,
      city: c.city ?? null,
      language: c.language ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      occupation: c.occupation ?? null,
      status: c.status ?? null,
      next_follow_up: c.next_follow_up ?? null,
      preferred_contact_time: c.preferred_contact_time ?? null,
      net_worth: c.net_worth ?? null,
      liquid_funds: c.liquid_funds ?? null,
      monthly_income: c.monthly_income ?? null,
      exposure_elsewhere: c.exposure_elsewhere ?? null,
      source_of_funds: c.source_of_funds ?? null,
      deposit_appetite: c.deposit_appetite ?? null,
    });
    setNotes(c.notes ?? "");
  }, [clientQ.data]);

  const deposits = depositsQ.data ?? [];
  const withdrawals = withdrawalsQ.data ?? [];
  const baseCcy = getDisplayCurrency();
  const depositTotal = deposits.reduce((a, d) => a + toDisplay(d.amount, d.currency), 0);
  const wdTotal = withdrawals.reduce((a: number, d: any) => a + toDisplay(d.amount, d.currency), 0);
  const cur = clientQ.data;
  const opening = Number(cur?.balance || 0);
  const balance = opening + depositTotal - wdTotal;
  // Client P&L: net of processing fees, payouts and the cost of acquiring them.
  const feeInfo = feeTotals(deposits as any[], settings);
  const acquisitionCost = fromWorkspace(leadCostPerClient((clientQ.data as any)?.daily_lead_entries ?? null));
  const clientProfitValue = feeInfo.net - wdTotal - acquisitionCost;
  const qualifies = cur ? qualifiesAsFtd(cur as any, opening + depositTotal, settings) : false;
  const stdCount = cur ? stdDepositsFor(cur as any, deposits as any).length : 0;
  const lastDeposit = deposits.length ? deposits[deposits.length - 1].date : null;
  const lastContact = commsQ.data?.[0]?.occurred_at ?? null;
  const tier = valueTier(cur?.potential_value, settings);
  const neglected = cur
    ? isNeglected({
        startDate: activationDate(cur as any),
        depositDates: deposits.map((d: any) => d.date),
        contactDates: (commsQ.data ?? []).map((c: any) => c.occurred_at),
      })
    : false;
  const neglectedRated = neglected && tier !== "unrated";

  // Activity intelligence: one explainable score from deposits, contact,
  // headroom, KYC and payout behaviour.
  const health = useMemo(
    () => clientHealth({
      deposits: deposits.map((d: any) => ({ date: d.date, amount: toDisplay(d.amount, d.currency) })),
      withdrawals: (withdrawals as any[]).map((w) => ({ date: w.date, amount: toDisplay(w.amount, w.currency) })),
      contactDates: (commsQ.data ?? []).map((c: any) => c.occurred_at),
      kyc: (cur as any)?.kyc,
      potentialValue: cur?.potential_value,
      activationDate: cur ? activationDate(cur as any) : null,
      balance,
    }),
    [deposits, withdrawals, commsQ.data, cur, balance],
  );

  // Next best action: one concrete instruction derived from their own rhythm.
  const nba = useMemo(
    () => nextBestAction({
      name: cur?.lead_name,
      deposits: deposits.map((d: any) => ({ date: d.date, amount: toDisplay(d.amount, d.currency) })),
      withdrawals: (withdrawals as any[]).map((w) => ({ date: w.date, amount: toDisplay(w.amount, w.currency) })),
      contactDates: (commsQ.data ?? []).map((c: any) => c.occurred_at),
      kyc: (cur as any)?.kyc,
      potentialValue: cur?.potential_value,
      activationDate: cur ? activationDate(cur as any) : null,
      nextFollowUp: cur?.next_follow_up ?? null,
      answered: cur?.answered ?? null,
      phone: cur?.phone ?? null,
      email: cur?.email ?? null,
      preferredContactTime: cur?.preferred_contact_time ?? null,
      money: fmtMoney,
    }),
    [deposits, withdrawals, commsQ.data, cur],
  );

  const transactions = useMemo(() => {
    const rows = [
      ...deposits.map((d: any) => ({
        id: `d-${d.id}`, date: d.date, kind: "deposit" as const,
        label: d.notes ? `Deposit — ${d.notes}` : "Deposit",
        delta: toDisplay(d.amount, d.currency), employee_id: d.employee_id, method: d.method,
      })),
      ...withdrawals.map((w: any) => ({
        id: `w-${w.id}`, date: w.date, kind: "withdrawal" as const,
        label: w.notes ? `Withdrawal — ${w.notes}` : "Withdrawal",
        delta: -toDisplay(w.amount, w.currency), employee_id: w.employee_id, method: null as string | null,
      })),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const act = cur ? activationDate(cur as any) : null;
    const openingRow =
      opening !== 0
        ? [{
            id: "opening",
            date: act ?? rows[0]?.date ?? null,
            kind: "deposit" as const,
            label: "Activation deposit",
            delta: opening,
            employee_id: cur?.conversion_employee_id ?? cur?.employee_id ?? null,
            method: null as string | null,
          }]
        : [];

    let running = 0;
    return [...openingRow, ...rows].map((r) => {
      running += r.delta;
      return { ...r, balance: running };
    });
  }, [deposits, withdrawals, opening, cur]);


  const journeyStages = useMemo<JourneyStage[]>(() => {
    if (!cur) return [];
    const act = activationDate(cur as any);
    const stds = stdDepositsFor(cur as any, deposits as any);
    const secondDep = stds[0] as any | undefined;
    const comms = commsQ.data ?? [];
    const lastComm = comms[0] as any | undefined;
    return [
      {
        key: "lead",
        label: "Lead received",
        date: cur.daily_lead_entries?.entry_date ?? null,
        detail: cur.daily_lead_entries?.lead_sources?.name ?? null,
        done: !!cur.daily_lead_entries?.entry_date,
      },
      {
        /* The activation opening balance *is* the first deposit (FTD), so the
         * journey shows one funding milestone instead of two duplicates. */
        key: "activation",
        label: "Activated",
        date: act,
        detail: opening ? `first deposit ${fmtMoney(opening)}` : null,
        done: !!act,
      },

      {
        key: "qualified",
        label: "Qualified FTD",
        date: cur.qualified_at ? String(cur.qualified_at).slice(0, 10) : null,
        detail: qualifies && !cur.qualified_at ? "meets threshold" : null,
        done: !!cur.qualified_at || qualifies,
      },
      {
        key: "std",
        label: "Repeat deposit (STD)",
        date: secondDep?.date ?? null,
        detail: stdCount > 1 ? `${stdCount} repeat deposits` : null,
        done: stdCount > 0,
      },
      {
        key: "contact",
        label: "Contacted",
        date: lastComm?.occurred_at ?? null,
        detail: lastComm ? `${comms.length} touch${comms.length === 1 ? "" : "es"} · last ${lastComm.channel}` : null,
        done: comms.length > 0,
      },
    ];
  }, [cur, deposits, commsQ.data, opening, qualifies, stdCount, baseCcy]);

  const journeyNextSteps = useMemo(() => {
    const out: { label: string; value: string; icon?: "date" | "ai" }[] = [];
    if (cur?.next_follow_up) out.push({ label: "Follow-up due", value: fmtDate(String(cur.next_follow_up).slice(0, 10)) });
    if (cur?.ai_next_action) out.push({ label: "Suggested action", value: String(cur.ai_next_action), icon: "ai" });
    if (!out.length) {
      out.push({
        label: "Next",
        value: neglected
          ? "No contact or deposit in the last 14 days — reach out."
          : "Set a follow-up date or log the next contact.",
      });
    }
    return out;
  }, [cur?.next_follow_up, cur?.ai_next_action, neglected]);


  const employeeName = (eid?: string | null) =>
    (employeesQ.data ?? []).find((e) => e.id === eid)?.name ?? "—";

  /** Retention-team agents, plus the currently assigned one even if inactive
   * or on another team, so the select always shows a real name. */
  const retentionOptions: { id: string; name: string }[] = (() => {
    const list = (retentionAgentsQ.data ?? []).map((e) => ({ id: e.id, name: e.name }));
    const assigned = cur?.employee_id;
    if (assigned && !list.some((e) => e.id === assigned)) {
      list.unshift({ id: assigned, name: employeeName(assigned) });
    }
    return list;
  })();


  if (clientQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading client…</div>;
  }
  if (!cur) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">This client no longer exists.</p>
        <Button asChild variant="outline" className="mt-3"><Link to="/activations" search={{ client: undefined, name: undefined }}>Back to clients</Link></Button>
      </div>
    );
  }

  const age = clientAge(cur);
  const sinceDeposit = daysSince(lastDeposit);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        eyebrow="Client"
        title={cur.lead_name || "Unnamed client"}
        description={[cur.daily_lead_entries?.lead_sources?.name, cur.country, age ? `${age} yrs` : null]
          .filter(Boolean)
          .join(" · ") || "Full profile, money movements and insight."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FavoriteStar type="client" id={cur.id} label={cur.lead_name} />
            <Button asChild variant="outline" size="sm">
              <Link to="/activations" search={{ client: undefined, name: undefined }}><ArrowLeft className="mr-1.5 h-4 w-4" /> All clients</Link>
            </Button>
            <AiClientPaste
              current={cur as any}
              applying={save.isPending}
              onApply={(patch) => {
                setDraft((d) => (d ? { ...d, ...(patch as any) } : d));
                if (typeof (patch as any).notes === "string") setNotes((patch as any).notes);
                save.mutate(patch);
              }}
            />
            <Button size="sm" onClick={() => analyse.mutate()} disabled={analyse.isPending}>

              {analyse.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              Analyse this client
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
              <Banknote className="mr-1.5 h-4 w-4" /> Request deposit
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => setManualOpen(true)}>
                <Banknote className="mr-1.5 h-4 w-4" /> Add deposit
              </Button>
            )}
            <ContactActions phone={cur.phone} email={cur.email} name={cur.lead_name} />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <HealthBadge health={health} prefix="Health" />
        <StatusBadge status={cur.status} prefix="Stage:" />
        <TierBadge value={cur.potential_value} thresholds={settings} showUnrated prefix="Value tier:" />
        <PotentialBadge potential={cur.potential ?? undefined} prefix="Agent call:" />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <RiskBadge score={cur.ai_risk_score} label={cur.ai_risk_label} prefix="AI risk" />
        <OpportunityBadge score={cur.ai_opportunity_score} label={cur.ai_opportunity_label} prefix="AI upside" />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <AnsweredBadge answered={!!cur.answered} />
        <Badge variant={qualifies ? "default" : "secondary"}>{qualifies ? "Qualified FTD" : "FTD pending"}</Badge>
        {stdCount > 0 && <Badge variant="default">STD ×{stdCount}</Badge>}
        {cur.legacy && <Badge variant="outline" className="text-muted-foreground">Legacy</Badge>}
        {neglectedRated && (
          <Badge variant="outline" className="border-rose-500/50 text-rose-600 dark:text-rose-400">
            Neglected {TIER_LABEL[tier].toLowerCase()}
          </Badge>
        )}
        <KycBadge value={(cur as any).kyc} />
        <TagBadges tags={cur.tags} />
      </div>


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Potential"
          value={potentialValue(cur.potential_value) != null ? fmtMoney(Number(cur.potential_value)) : "—"}
          hint={TIER_LABEL[tier]}
        />
        <StatCard
          label="Headroom score"
          value={cur.ai_opportunity_score != null ? `${cur.ai_opportunity_score}/100` : "—"}
          hint={cur.ai_opportunity_label ?? "run an analysis"}
        />
        <StatCard
          label="Client health"
          value={`${health.score}/100`}
          hint={health.advice}
          tone={health.band === "critical" ? "negative" : health.band === "at-risk" ? undefined : "positive"}
        />
        <StatCard label="Balance" value={fmtMoney(balance)} />
        <StatCard label="Deposits" value={fmtMoney(depositTotal)} hint={`${deposits.length} deposit${deposits.length === 1 ? "" : "s"}`} />
        <StatCard label="Withdrawals" value={fmtMoney(wdTotal)} hint={`${withdrawals.length} payout${withdrawals.length === 1 ? "" : "s"}`} />
        <StatCard label="Net to us" value={fmtMoney(depositTotal - wdTotal)} />
        <StatCard
          label="Profit"
          value={fmtMoney(clientProfitValue)}
          tone={clientProfitValue >= 0 ? "positive" : "negative"}
          hint={`Deposits −${fmtMoney(feeInfo.fees)} fees −${fmtMoney(wdTotal)} payouts −${fmtMoney(acquisitionCost)} acquisition`}
        />
        <StatCard
          label="Since last deposit"
          value={sinceDeposit == null ? "—" : `${sinceDeposit}d`}
          hint={lastDeposit ? fmtDate(lastDeposit) : "no deposits yet"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card-surface p-5">
            <NextBestActionCard
              action={nba}
              activationId={cur.id}
              clientName={cur.lead_name}
              phone={cur.phone}
              email={cur.email}
              currentFollowUp={cur.next_follow_up}
              onFollowUp={(date) => save.mutate({ next_follow_up: date })}
            />
          </section>

          <section className="card-surface p-5">
            <ClientJourney stages={journeyStages} nextSteps={journeyNextSteps} />
          </section>

          <section className="card-surface p-5">
            <h2 className="font-display text-base font-semibold">AI insight</h2>
            {cur.ai_summary ? (
              <div className="mt-3 space-y-3 text-sm">
                <p className="leading-relaxed">{cur.ai_summary}</p>
                {cur.ai_next_action && (
                  <p className="rounded-lg border border-border bg-foreground/[0.02] p-3">
                    <span className="text-xs uppercase text-muted-foreground">Next action</span>
                    <br />
                    {cur.ai_next_action}
                  </p>
                )}
                {(cur.ai_opportunity_score != null || cur.ai_opportunity_reason) && (
                  <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
                    <span className="text-xs uppercase text-muted-foreground">Deposit headroom</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <OpportunityBadge score={cur.ai_opportunity_score} label={cur.ai_opportunity_label} />
                      {cur.ai_suggested_potential != null && (
                        <span className="text-xs text-muted-foreground">
                          AI estimate {fmtMoney(Number(cur.ai_suggested_potential))}
                          {potentialValue(cur.potential_value) != null
                            ? ` vs recorded ${fmtMoney(Number(cur.potential_value))}`
                            : " · no potential recorded"}
                        </span>
                      )}
                    </div>
                    {cur.ai_opportunity_reason && <p className="mt-1.5">{cur.ai_opportunity_reason}</p>}
                    {cur.ai_suggested_potential != null && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={save.isPending}
                        onClick={() => save.mutate({ potential_value: Number(cur.ai_suggested_potential) })}
                      >
                        Use AI estimate as potential
                      </Button>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Attention score <RiskBadge score={cur.ai_risk_score} label={cur.ai_risk_label} className="mx-1 align-middle" />
                  {cur.ai_analyzed_at ? `· updated ${fmtDate(String(cur.ai_analyzed_at).slice(0, 10))}` : ""}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Run an analysis to read this client's behaviour from their comments, calls, deposits and withdrawals.
              </p>
            )}
          </section>

          <section className="card-surface p-5">
            <h2 className="font-display text-base font-semibold">Profile</h2>
            {draft && (
              <>
                <ClientProfileFields
                  className="mt-3"
                  value={draft}
                  onChange={(patch) => setDraft({ ...draft, ...patch })}
                />
                <div className="mt-4 rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Financial KYC</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    What the money behind this client looks like — the headroom score is judged against this.
                  </p>
                  <ClientKycFields
                    className="mt-3"
                    value={draft}
                    onChange={(patch) => setDraft({ ...draft, ...patch })}
                  />
                </div>
                <div className="mt-4 rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Compliance checklist</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Documents collected for this client. Each tick records who ticked it and when.
                  </p>
                  <ClientKycChecklist
                    className="mt-3"
                    value={(cur as any).kyc}
                    by={user?.email ?? null}
                    onChange={(next) => save.mutate({ kyc: next })}
                  />
                </div>

                <div className="mt-3 grid gap-1.5">
                  <label className="text-xs text-muted-foreground">Tags</label>
                  <TagPicker value={cur.tags ?? []} onChange={(tags) => save.mutate({ tags })} />
                </div>
                {notes.trim() ? (
                  <div className="mt-3 grid gap-1.5">
                    <label className="text-xs text-muted-foreground">
                      Legacy note <span className="opacity-70">— older free-text note; new notes go in the log below</span>
                    </label>
                    <Textarea
                      rows={5}
                      className="min-h-[110px] resize-y leading-relaxed"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                ) : null}

                <div className="mt-3 flex justify-end">
                  <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ ...draft, notes: notes.trim() || null })}>
                    {save.isPending ? "Saving…" : "Save profile"}
                  </Button>
                </div>

              </>
            )}
          </section>

          <section className="card-surface p-5">
            <h2 className="font-display text-base font-semibold">Transactions</h2>
            {transactions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No deposits or withdrawals yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto scroll-slim rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-t border-border/50">
                        <td className="px-3 py-2">{fmtDate(String(t.date))}</td>
                        <td className="px-3 py-2 capitalize">{t.kind}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t.label}</td>
                        <td className="px-3 py-2"><EmployeeLink id={t.employee_id} name={employeeName(t.employee_id)} /></td>
                        <td className={`px-3 py-2 text-right num ${t.delta < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                          {t.delta < 0 ? "−" : "+"}{fmtMoney(Math.abs(t.delta))}
                        </td>
                        <td className="px-3 py-2 text-right num">{fmtMoney(t.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>


          <section className="card-surface p-5">
            <Client360Timeline
              client={cur}
              deposits={deposits}
              withdrawals={withdrawals}
              comms={commsQ.data ?? []}
              employeeName={employeeName}
            />
          </section>


          <section className="card-surface p-5">
            <ClientCommunications activationId={cur.id} clientName={cur.lead_name} />
          </section>

          <section className="card-surface p-5">
            <ClientDepositHistory activationId={cur.id} />
          </section>

          <ManualDepositDialog
            open={manualOpen}
            onOpenChange={setManualOpen}
            client={{ id: cur.id, lead_name: cur.lead_name, employee_id: cur.employee_id }}
          />

          <DepositRequestDialog
            open={requestOpen}
            onOpenChange={setRequestOpen}
            client={{
              id: cur.id,
              lead_name: cur.lead_name,
              employee_id: cur.employee_id,
              age: cur.age ?? null,
              country: cur.country ?? null,
              city: cur.city ?? null,
            }}
          />

          <section className="card-surface p-5">
            <CommentThread entityType="client" entityId={cur.id} title="Notes & comments" />
          </section>
        </div>

        <div className="space-y-5">
          <section className="card-surface p-5">
            <ClientHealthCard health={health} />
          </section>

          <section className="card-surface p-5 text-sm">
            <h2 className="mb-3 font-display text-base font-semibold">At a glance</h2>
            <dl className="space-y-2">
              <Row label="Source" value={cur.daily_lead_entries?.lead_sources?.name ?? "—"} />
              <Row label="Lead received" value={cur.daily_lead_entries?.entry_date ? fmtDate(cur.daily_lead_entries.entry_date) : "—"} />
              <Row label="Activated" value={cur.activation_date ? fmtDate(cur.activation_date) : "—"} />
              <Row label="Qualified" value={cur.qualified_at ? fmtDate(String(cur.qualified_at).slice(0, 10)) : "Pending"} />
              <Row label="Conversion agent" value={<EmployeeLink id={cur.conversion_employee_id} name={employeeName(cur.conversion_employee_id)} />} />
              <Row
                label="Retention agent"
                value={
                  canAllocate ? (
                    <Select
                      value={cur.employee_id || "_none"}
                      onValueChange={(v) => save.mutate({ employee_id: v === "_none" ? null : v })}
                      disabled={save.isPending}
                    >
                      <SelectTrigger
                        aria-label="Retention agent"
                        className="ml-auto h-7 w-auto max-w-[200px] justify-end gap-1 border-0 bg-transparent px-1.5 text-sm font-medium shadow-none hover:bg-accent/50 focus:ring-0 focus:ring-offset-0"
                      >
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="_none">Unassigned</SelectItem>
                        {retentionOptions.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <EmployeeLink id={cur.employee_id} name={employeeName(cur.employee_id)} />
                  )
                }
              />

              <Row label="Age" value={age != null ? String(age) : "—"} />
              <Row label="Country" value={cur.country || "—"} />
              <Row label="City" value={cur.city || "—"} />
              <Row label="Language" value={cur.language || "—"} />
              <Row label="Occupation" value={cur.occupation || "—"} />
              <Row label="Phone" value={cur.phone || "—"} />
              <Row label="Email" value={cur.email || "—"} />
              <Row label="Best time" value={cur.preferred_contact_time || "—"} />
              <Row label="Next follow-up" value={cur.next_follow_up ? fmtDate(cur.next_follow_up) : "—"} />
              <Row label="Last contact" value={lastContact ? fmtDate(String(lastContact).slice(0, 10)) : "—"} />
            </dl>
          </section>

          <section className="card-surface p-5">
            <AttachmentsPanel entityType="client" entityId={cur.id} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
