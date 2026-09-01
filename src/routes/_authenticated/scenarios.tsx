import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { DateRangePicker, getRange, type RangeKey } from "@/components/date-range-picker";
import { getScenarioBaseline } from "@/lib/scenario.functions";
import {
  PRESETS, baselineResult, leversFromBaseline, runScenario,
  type ScenarioBaseline, type ScenarioLevers, type ScenarioResult,
} from "@/lib/scenario";
import { fmtMoney } from "@/lib/format";
import { toDisplay, useFxRates } from "@/lib/fx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scenarios")({
  head: () => ({
    meta: [
      { title: "Scenario modelling — Ledgerly" },
      { name: "description", content: "Model what happens to FTDs, revenue and profit when CPL, conversion rate or average deposit changes." },
      { property: "og:title", content: "Scenario modelling — Ledgerly" },
      { property: "og:description", content: "Model what happens to FTDs, revenue and profit when CPL, conversion rate or average deposit changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScenariosPage,
});

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const money = (n: number) => fmtMoney(toDisplay(n, "USD"));
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const rate = (n: number) => `${(n * 100).toFixed(1)}%`;

function ScenariosPage() {
  const fx = useFxRates();
  const [rangeKey, setRangeKey] = useState<RangeKey>("quarter");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const range = getRange(rangeKey, custom);

  const baselineQ = useQuery({
    queryKey: ["scenario-baseline", iso(range.start), iso(range.end)],
    enabled: !fx.loading,
    queryFn: () => getScenarioBaseline({ data: { start: iso(range.start), end: iso(range.end) } }),
  });

  const baseline = baselineQ.data as ScenarioBaseline | undefined;
  const [levers, setLevers] = useState<ScenarioLevers | null>(null);

  useEffect(() => {
    if (baseline) setLevers(leversFromBaseline(baseline));
  }, [baseline]);

  const current = useMemo(() => (baseline ? baselineResult(baseline) : null), [baseline]);
  const scenario = useMemo(
    () => (baseline && levers ? runScenario(baseline, levers) : null),
    [baseline, levers],
  );

  const set = (patch: Partial<ScenarioLevers>) =>
    setLevers((l) => (l ? { ...l, ...patch } : l));

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        eyebrow="Planning"
        title="Scenario modelling"
        description="Start from your real funnel, then move one lever and see FTDs, revenue and profit react."
        actions={
          <DateRangePicker
            value={rangeKey}
            onChange={setRangeKey}
            customStart={custom.start}
            customEnd={custom.end}
            onCustomChange={(start, end) => setCustom({ start, end })}
          />
        }
      />

      {baselineQ.isLoading || !baseline || !levers || !current || !scenario ? (
        <p className="text-sm text-muted-foreground">Loading your funnel…</p>
      ) : baseline.leads === 0 ? (
        <p className="text-sm text-muted-foreground">
          No lead volume recorded in {range.label.toLowerCase()} — pick a wider period to model against.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="card-surface space-y-5 p-5 lg:col-span-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Levers</h2>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setLevers(leversFromBaseline(baseline))}
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Reset
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-3 text-xs"
                  title={p.hint}
                  onClick={() => setLevers((l) => (l ? p.apply(baseline, l) : l))}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <LeverSlider
              label="Lead volume"
              value={levers.leadVolumePct}
              display={`${levers.leadVolumePct > 0 ? "+" : ""}${levers.leadVolumePct}% · ${num(scenario.leads)} leads`}
              min={-80} max={200} step={5}
              onChange={(v) => set({ leadVolumePct: v })}
            />
            <LeverSlider
              label="Cost per lead"
              value={levers.cplPct}
              display={`${levers.cplPct > 0 ? "+" : ""}${levers.cplPct}% · ${money(scenario.cpl)} / lead`}
              min={-50} max={100} step={5}
              onChange={(v) => set({ cplPct: v })}
            />
            <LeverSlider
              label="Activation rate"
              value={Number((levers.activationRate * 100).toFixed(1))}
              display={`${rate(levers.activationRate)} · ${num(scenario.activations)} activations`}
              min={0} max={50} step={0.5}
              onChange={(v) => set({ activationRate: v / 100 })}
            />
            <LeverSlider
              label="FTD rate (of activations)"
              value={Number((levers.ftdRate * 100).toFixed(1))}
              display={`${rate(levers.ftdRate)} · ${num(scenario.ftds)} FTDs`}
              min={0} max={100} step={1}
              onChange={(v) => set({ ftdRate: v / 100 })}
            />
            <LeverSlider
              label="Average FTD value"
              value={levers.avgFtdPct}
              display={`${levers.avgFtdPct > 0 ? "+" : ""}${levers.avgFtdPct}% · ${money(scenario.avgFtd)}`}
              min={-50} max={100} step={5}
              onChange={(v) => set({ avgFtdPct: v })}
            />
            <LeverSlider
              label="Fixed operating costs"
              value={levers.fixedCostsPct}
              display={`${levers.fixedCostsPct > 0 ? "+" : ""}${levers.fixedCostsPct}% · ${money(scenario.fixedCosts)}`}
              min={-50} max={100} step={5}
              onChange={(v) => set({ fixedCostsPct: v })}
            />
            <LeverSlider
              label="Client payouts"
              value={levers.withdrawalsPct}
              display={`${levers.withdrawalsPct > 0 ? "+" : ""}${levers.withdrawalsPct}% · ${money(scenario.withdrawals)}`}
              min={-100} max={100} step={5}
              onChange={(v) => set({ withdrawalsPct: v })}
            />
          </section>

          <section className="space-y-5 lg:col-span-2">
            <div className="card-surface p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold">Current vs scenario</h2>
                <span className="text-xs text-muted-foreground">
                  Baseline: {range.label} ({baseline.start} → {baseline.end})
                </span>
              </div>
              <ComparisonTable current={current} scenario={scenario} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <DeltaCard label="Profit" current={current.profit} next={scenario.profit} format={money} />
              <DeltaCard label="Revenue" current={current.revenue} next={scenario.revenue} format={money} />
              <DeltaCard label="FTDs" current={current.ftds} next={scenario.ftds} format={num} />
            </div>

            <div className="card-surface p-5 text-sm">
              <h3 className="mb-2 font-display text-base font-semibold">Read-out</h3>
              <p className="text-muted-foreground">{narrate(current, scenario)}</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function LeverSlider({
  label, value, display, min, max, step, onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium">{label}</label>
        <span className="num text-xs text-muted-foreground">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? 0)}
      />
    </div>
  );
}

function ComparisonTable({ current, scenario }: { current: ScenarioResult; scenario: ScenarioResult }) {
  const rows: { label: string; a: string; b: string; delta?: number; invert?: boolean }[] = [
    { label: "Leads", a: num(current.leads), b: num(scenario.leads), delta: scenario.leads - current.leads },
    { label: "Cost per lead", a: money(current.cpl), b: money(scenario.cpl), delta: scenario.cpl - current.cpl, invert: true },
    { label: "Activation rate", a: rate(current.activationRate), b: rate(scenario.activationRate), delta: scenario.activationRate - current.activationRate },
    { label: "Activations", a: num(current.activations), b: num(scenario.activations), delta: scenario.activations - current.activations },
    { label: "FTD rate", a: rate(current.ftdRate), b: rate(scenario.ftdRate), delta: scenario.ftdRate - current.ftdRate },
    { label: "FTDs", a: num(current.ftds), b: num(scenario.ftds), delta: scenario.ftds - current.ftds },
    { label: "Average FTD", a: money(current.avgFtd), b: money(scenario.avgFtd), delta: scenario.avgFtd - current.avgFtd },
    { label: "Revenue", a: money(current.revenue), b: money(scenario.revenue), delta: scenario.revenue - current.revenue },
    { label: "Acquisition cost", a: money(current.acquisitionCost), b: money(scenario.acquisitionCost), delta: scenario.acquisitionCost - current.acquisitionCost, invert: true },
    { label: "Fixed costs", a: money(current.fixedCosts), b: money(scenario.fixedCosts), delta: scenario.fixedCosts - current.fixedCosts, invert: true },
    { label: "Client payouts", a: money(current.withdrawals), b: money(scenario.withdrawals), delta: scenario.withdrawals - current.withdrawals, invert: true },
    { label: "Profit", a: money(current.profit), b: money(scenario.profit), delta: scenario.profit - current.profit },
    { label: "Profit per lead", a: money(current.profitPerLead), b: money(scenario.profitPerLead), delta: scenario.profitPerLead - current.profitPerLead },
    { label: "Cost per FTD", a: money(current.cpa), b: money(scenario.cpa), delta: scenario.cpa - current.cpa, invert: true },
    { label: "ROAS", a: `${current.roas.toFixed(2)}×`, b: `${scenario.roas.toFixed(2)}×`, delta: scenario.roas - current.roas },
  ];

  return (
    <div className="overflow-x-auto scroll-slim rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Metric</th>
            <th className="px-3 py-2 text-right font-medium">Current</th>
            <th className="px-3 py-2 text-right font-medium">Scenario</th>
            <th className="px-3 py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const good = r.delta == null || r.delta === 0 ? null : (r.invert ? r.delta < 0 : r.delta > 0);
            const changed = !!r.delta && Math.abs(r.delta) > 1e-9;
            return (
              <tr key={r.label} className={cn("border-t border-border/50", r.label === "Profit" && "bg-foreground/[0.03] font-medium")}>
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right num text-muted-foreground">{r.a}</td>
                <td className="px-3 py-2 text-right num">{r.b}</td>
                <td className={cn(
                  "px-3 py-2 text-right num text-xs",
                  !changed ? "text-muted-foreground" : good ? "text-emerald-500" : "text-rose-500",
                )}>
                  {changed ? pctChange(r) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function pctChange(r: { a: string; b: string; delta?: number }) {
  const d = r.delta ?? 0;
  return `${d > 0 ? "+" : "−"}${Math.abs(d) >= 1 ? Math.round(Math.abs(d)).toLocaleString("en-US") : Math.abs(d).toFixed(3)}`;
}

function DeltaCard({
  label, current, next, format,
}: {
  label: string;
  current: number;
  next: number;
  format: (n: number) => string;
}) {
  const delta = next - current;
  const pct = current ? (delta / Math.abs(current)) * 100 : 0;
  const up = delta >= 0;
  return (
    <div className="card-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="num text-muted-foreground">{format(current)}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="num text-lg font-semibold">{format(next)}</span>
      </div>
      <Badge
        variant="outline"
        className={cn("mt-2 gap-1", up ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400" : "border-rose-500/50 text-rose-600 dark:text-rose-400")}
      >
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%
      </Badge>
    </div>
  );
}

function narrate(current: ScenarioResult, scenario: ScenarioResult) {
  const dp = scenario.profit - current.profit;
  if (Math.abs(dp) < 1) return "This scenario is identical to your current funnel — move a lever to see the impact.";
  const direction = dp > 0 ? "gains" : "loses";
  const ftdDelta = Math.round(scenario.ftds - current.ftds);
  const breakEvenCpl = scenario.leads
    ? (scenario.revenue - scenario.fixedCosts - scenario.withdrawals) / scenario.leads
    : 0;
  return [
    `The business ${direction} ${money(Math.abs(dp))} of profit versus the baseline`,
    ftdDelta !== 0 ? ` on ${Math.abs(ftdDelta)} ${ftdDelta > 0 ? "more" : "fewer"} FTDs` : "",
    `. At this conversion and deposit size you break even at a cost per lead of ${money(Math.max(0, breakEvenCpl))}`,
    scenario.profit < 0 ? " — this scenario is loss-making." : ".",
  ].join("");
}
