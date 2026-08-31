import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Building2,
  Check,
  ChevronLeft,
  Loader2,
  PartyPopper,
  Radio,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SETTINGS_QUERY_KEY } from "@/lib/settings";
import {
  ONBOARDING_QUERY_KEY,
  saveOnboarding,
  shouldAutoOpen,
  useOnboardingState,
  type StepStatus,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type Ctx = { openWizard: () => void };
const OnboardingCtx = createContext<Ctx>({ openWizard: () => {} });
export const useOnboardingWizard = () => useContext(OnboardingCtx);

const STEPS = [
  { key: "step_basics", title: "Company basics", icon: Building2 },
  { key: "step_source", title: "Lead source", icon: Radio },
  { key: "step_agent", title: "First agent", icon: UserRound },
  { key: "step_affiliate", title: "First affiliate", icon: Users },
] as const;

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];
import { FX_CURRENCIES } from "@/lib/fx";

const CURRENCIES = [...FX_CURRENCIES];

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [autoChecked, setAutoChecked] = useState(false);
  const { data: state } = useOnboardingState();

  useEffect(() => {
    if (autoChecked || !state) return;
    setAutoChecked(true);
    if (shouldAutoOpen(state)) setOpen(true);
  }, [state, autoChecked]);

  const value = useMemo<Ctx>(() => ({ openWizard: () => setOpen(true) }), []);

  return (
    <OnboardingCtx.Provider value={value}>
      {children}
      <OnboardingWizard open={open} onOpenChange={setOpen} />
    </OnboardingCtx.Provider>
  );
}

function Stepper({ index, statuses }: { index: number; statuses: StepStatus[] }) {
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {STEPS.map((s, i) => {
        const done = statuses[i] === "done";
        const skipped = statuses[i] === "skipped";
        const active = i === index;
        return (
          <div key={s.key} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                active && "border-primary bg-primary text-primary-foreground",
                !active && done && "border-primary/40 bg-primary/10 text-primary",
                !active && skipped && "border-dashed border-border text-muted-foreground",
                !active && !done && !skipped && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "hidden truncate text-xs sm:inline",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s.title}
            </span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function OnboardingWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { companyId, company, isAdmin } = useAuth();
  const { data: state } = useOnboardingState();
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  const [basics, setBasics] = useState({ logo_url: "", timezone: "UTC", currency: "USD" });
  const [source, setSource] = useState({ name: "", pricing_model: "CPA", price: "", expected_conversion_rate: "" });
  const [agent, setAgent] = useState({ name: "", team: "C", salary: "", commission_pct: "8" });
  const [affiliate, setAffiliate] = useState({ name: "", guarantee_value: "", group_key: "" });

  const statuses: StepStatus[] = [
    (state?.row?.step_basics ?? "pending") as StepStatus,
    (state?.row?.step_source ?? "pending") as StepStatus,
    (state?.row?.step_agent ?? "pending") as StepStatus,
    (state?.row?.step_affiliate ?? "pending") as StepStatus,
  ];

  useEffect(() => {
    if (!open) return;
    setFinished(!!state?.row?.completed_at && statuses.every((s) => s !== "pending"));
    const firstPending = statuses.findIndex((s) => s === "pending");
    setIndex(firstPending === -1 ? 0 : firstPending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase
      .from("company_settings")
      .select("currency,timezone,logo_url")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setBasics({
          logo_url: (data as any).logo_url ?? "",
          timezone: (data as any).timezone ?? "UTC",
          currency: (data as any).currency ?? "USD",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const advance = async (patchKey: (typeof STEPS)[number]["key"], status: StepStatus) => {
    if (!companyId) return;
    const patch: Record<string, unknown> = { [patchKey]: status };
    const next = index + 1;
    const nextStatuses = statuses.map((s, i) => (i === index ? status : s));
    if (next >= STEPS.length && nextStatuses.every((s) => s !== "pending")) {
      patch.completed_at = new Date().toISOString();
    }
    await saveOnboarding(companyId, patch as never);
    await qc.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    if (next >= STEPS.length) setFinished(true);
    else setIndex(next);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No workspace selected");
      if (index === 0) {
        const { error } = await supabase.from("company_settings").upsert(
          {
            company_id: companyId,
            logo_url: basics.logo_url.trim() || null,
            timezone: basics.timezone,
            currency: basics.currency,
          },
          { onConflict: "company_id" },
        );
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      } else if (index === 1) {
        if (!source.name.trim()) throw new Error("Give the lead source a name");
        const { error } = await supabase.from("lead_sources").insert({
          name: source.name.trim(),
          pricing_model: source.pricing_model as "CPL" | "CPA",
          price: Number(source.price) || 0,
          expected_conversion_rate: Number(source.expected_conversion_rate) || 0,
          active: true,
        });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["lead-sources"] });
      } else if (index === 2) {
        if (!agent.name.trim()) throw new Error("Give the agent a name");
        const pct = Number(agent.commission_pct) || 0;
        const { error } = await supabase.from("employees").insert({
          name: agent.name.trim(),
          team: agent.team,
          salary: Number(agent.salary) || 0,
          commission_pct: pct,
          commission_tier1_max: 50000,
          commission_tier1_pct: 8,
          commission_tier2_max: 100000,
          commission_tier2_pct: 10,
          commission_tier3_pct: 12,
          active: true,
        });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["employees"] });
      } else {
        if (!affiliate.name.trim()) throw new Error("Give the affiliate a name");
        const guarantee = Number(affiliate.guarantee_value) || 0;
        const { error } = await supabase.from("affiliates").insert({
          name: affiliate.name.trim(),
          guarantee_value: guarantee,
          guarantee_type: guarantee > 0 ? "conversion_rate" : "none",
          guarantee_period: "weekly",
          group_key: affiliate.group_key.trim() || null,
          cpa_rate: 0,
          active: true,
        });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["affiliates"] });
      }
      await advance(STEPS[index].key, "done");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const skip = useMutation({
    mutationFn: async () => advance(STEPS[index].key, "skipped"),
    onError: (e: any) => toast.error(e.message ?? "Could not skip"),
  });

  const Icon = STEPS[index].icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {finished ? (
          <div className="space-y-6 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PartyPopper className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="font-display text-2xl">You're ready to go!</DialogTitle>
              <DialogDescription>
                Your workspace is set up. Jump straight into the daily flow — you can revisit this setup guide any time
                from the sidebar.
              </DialogDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { to: "/leads", label: "Add leads" },
                { to: "/activations", label: "Add a client" },
                { to: "/revenue", label: "Record a deposit" },
              ].map((l) => (
                <Button key={l.to} variant="outline" asChild onClick={() => onOpenChange(false)}>
                  <Link to={l.to}>{l.label}</Link>
                </Button>
              ))}
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Go to dashboard
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Setup guide</span>
              </div>
              <Stepper index={index} statuses={statuses} />
              <DialogTitle className="flex items-center gap-2 font-display text-xl">
                <Icon className="h-5 w-5 text-primary" /> {STEPS[index].title}
              </DialogTitle>
              <DialogDescription>
                Step {index + 1} of {STEPS.length}. Everything here can be changed later.
              </DialogDescription>
            </DialogHeader>

            {!isAdmin ? (
              <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                Only workspace admins can complete the setup steps. Ask an admin to finish setting up this workspace.
              </p>
            ) : (
              <div className="space-y-4">
                {index === 0 && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Company name</Label>
                      <Input value={company?.name ?? ""} readOnly disabled />
                      <p className="text-xs text-muted-foreground">
                        Managed by the platform owner. Contact them to rename the workspace.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ob-logo">Logo URL</Label>
                      <Input
                        id="ob-logo"
                        placeholder="https://…/logo.png"
                        value={basics.logo_url}
                        onChange={(e) => setBasics({ ...basics, logo_url: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Timezone</Label>
                        <Select value={basics.timezone} onValueChange={(v) => setBasics({ ...basics, timezone: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIMEZONES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Currency</Label>
                        <Select value={basics.currency} onValueChange={(v) => setBasics({ ...basics, currency: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}

                {index === 1 && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="ob-src">Source name</Label>
                      <Input
                        id="ob-src"
                        placeholder="e.g. FTDhub"
                        value={source.name}
                        onChange={(e) => setSource({ ...source, name: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>Pricing model</Label>
                        <Select
                          value={source.pricing_model}
                          onValueChange={(v) => setSource({ ...source, pricing_model: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CPL">CPL — cost per lead</SelectItem>
                            <SelectItem value="CPA">CPA — cost per activation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-price">Price</Label>
                        <Input
                          id="ob-price"
                          type="number"
                          value={source.price}
                          onChange={(e) => setSource({ ...source, price: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-ecr">Expected conv. %</Label>
                        <Input
                          id="ob-ecr"
                          type="number"
                          value={source.expected_conversion_rate}
                          onChange={(e) => setSource({ ...source, expected_conversion_rate: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}

                {index === 2 && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="ob-agent">Agent name</Label>
                      <Input
                        id="ob-agent"
                        value={agent.name}
                        onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>Team</Label>
                        <Select value={agent.team} onValueChange={(v) => setAgent({ ...agent, team: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="C">C — Conversion</SelectItem>
                            <SelectItem value="R">R — Retention</SelectItem>
                            <SelectItem value="M">M — Manager</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-salary">Monthly salary</Label>
                        <Input
                          id="ob-salary"
                          type="number"
                          value={agent.salary}
                          onChange={(e) => setAgent({ ...agent, salary: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-comm">Base commission %</Label>
                        <Input
                          id="ob-comm"
                          type="number"
                          value={agent.commission_pct}
                          onChange={(e) => setAgent({ ...agent, commission_pct: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tiered commission starts at the standard 8% / 10% / 12% steps — fine-tune it later on the agent's
                      page.
                    </p>
                  </>
                )}

                {index === 3 && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="ob-aff">Affiliate name</Label>
                      <Input
                        id="ob-aff"
                        value={affiliate.name}
                        onChange={(e) => setAffiliate({ ...affiliate, name: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-guar">Weekly conversion guarantee %</Label>
                        <Input
                          id="ob-guar"
                          type="number"
                          placeholder="0 = flat, no guarantee"
                          value={affiliate.guarantee_value}
                          onChange={(e) => setAffiliate({ ...affiliate, guarantee_value: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-group">Billing group (optional)</Label>
                        <Input
                          id="ob-group"
                          placeholder="Share one balance across sources"
                          value={affiliate.group_key}
                          onChange={(e) => setAffiliate({ ...affiliate, group_key: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {index > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Back
                </Button>
              )}
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => skip.mutate()}
                disabled={skip.isPending}
              >
                Skip for now
              </button>
              <Button
                className="ml-auto"
                onClick={() => save.mutate()}
                disabled={!isAdmin || save.isPending || skip.isPending}
              >
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {index === STEPS.length - 1 ? "Finish" : "Save & continue"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
