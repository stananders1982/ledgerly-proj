import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const sb = supabase as any;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

function advance(dateISO: string, freq: string) {
  const d = new Date(dateISO + "T12:00:00");
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else if (freq === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return iso(d);
}

/** Occurrences of a recurring schedule that land inside the horizon. */
function expand(rows: any[], startISO: string, endISO: string) {
  const out: { date: string; amount: number; name: string }[] = [];
  for (const r of rows) {
    let d: string = r.next_due_date;
    let guard = 0;
    while (d && d <= endISO && guard < 200) {
      if ((!r.end_date || d <= r.end_date) && d >= startISO) {
        out.push({ date: d, amount: Number(r.amount || 0), name: r.name });
      }
      d = advance(d, String(r.frequency));
      guard++;
    }
  }
  return out;
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Least-squares slope of y over its index. */
function slope(ys: number[]) {
  const n = ys.length;
  if (n < 4) return 0;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (ys[i] - my);
    den += (i - mx) ** 2;
  }
  return den ? num / den : 0;
}

/**
 * 90-day cash-flow forecast.
 *
 * Revenue is projected from the trailing window with a weekday seasonality
 * factor and a dampened trend, rather than a single flat average, and known
 * recurring revenue is layered on top of its own schedule. The shaded band is
 * a confidence range built from how noisy the trailing days actually were.
 */
export function CashflowForecast({ days = 90 }: { days?: number }) {
  const today = useMemo(() => new Date(), []);
  const lookback = 90;
  const horizonEnd = useMemo(() => iso(addDays(today, days)), [today, days]);
  const lookbackStart = useMemo(() => iso(addDays(today, -lookback)), [today]);

  const recQ = useQuery({
    queryKey: ["forecast-recurring"],
    queryFn: async () => {
      const data = await fetchAll(() => sb
        .from("recurring_expenses")
        .select("id,name,amount,frequency,next_due_date,end_date,active")
        .eq("active", true));
      return (data ?? []) as any[];
    },
  });

  const recRevQ = useQuery({
    queryKey: ["forecast-recurring-revenue"],
    queryFn: async () => {
      const data = await fetchAll(() => sb
        .from("recurring_revenue")
        .select("id,name,amount,frequency,next_due_date,end_date,active")
        .eq("active", true));
      return (data ?? []) as any[];
    },
  });

  const revQ = useQuery({
    queryKey: ["forecast-revenue", lookbackStart],
    queryFn: async () => {
      const data = await fetchAll(() => sb
        .from("revenue")
        .select("amount,date")
        .gte("date", lookbackStart));
      return (data ?? []) as { amount: number; date: string }[];
    },
  });

  const model = useMemo(() => {
    const start = iso(today);

    // --- Learn the shape of the last 90 days --------------------------------
    const byDayHistory = new Map<string, number>();
    for (const r of revQ.data ?? []) {
      byDayHistory.set(r.date, (byDayHistory.get(r.date) ?? 0) + Number(r.amount || 0));
    }
    const history: { date: Date; v: number }[] = [];
    for (let i = lookback; i >= 1; i--) {
      const d = addDays(today, -i);
      history.push({ date: d, v: byDayHistory.get(iso(d)) ?? 0 });
    }
    const values = history.map((h) => h.v);
    const baseline = mean(values);

    // Weekday factor, clamped so a single big Tuesday can't dominate.
    const weekday: number[] = Array.from({ length: 7 }, (_, wd) => {
      const xs = history.filter((h) => h.date.getDay() === wd).map((h) => h.v);
      if (!xs.length || baseline <= 0) return 1;
      return Math.max(0.35, Math.min(1.9, mean(xs) / baseline));
    });

    // Dampened trend: at most ±40% drift across the whole horizon.
    const rawSlope = slope(values);
    const maxDrift = baseline * 0.4;
    const drift = baseline > 0 ? Math.max(-maxDrift, Math.min(maxDrift, rawSlope * days)) : 0;

    const residuals = history.map((h, i) => h.v - baseline * weekday[history[i].date.getDay()]);
    const noise = Math.sqrt(mean(residuals.map((r) => r * r)));

    // --- Scheduled money in and out ----------------------------------------
    const expenses = expand(recQ.data ?? [], start, horizonEnd);
    const recurringRevenue = expand(recRevQ.data ?? [], start, horizonEnd);
    const expByDay = new Map<string, number>();
    for (const o of expenses) expByDay.set(o.date, (expByDay.get(o.date) ?? 0) + o.amount);
    const recRevByDay = new Map<string, number>();
    for (const o of recurringRevenue) recRevByDay.set(o.date, (recRevByDay.get(o.date) ?? 0) + o.amount);

    // --- Project ------------------------------------------------------------
    let cum = 0;
    let projectedRevenue = 0;
    const points: { date: string; net: number; lo: number; band: number }[] = [];
    for (let i = 0; i <= days; i++) {
      const d = addDays(today, i);
      const key = iso(d);
      const trendPart = days ? (drift * i) / days : 0;
      const expected = Math.max(0, (baseline + trendPart) * weekday[d.getDay()]) + (recRevByDay.get(key) ?? 0);
      const exp = expByDay.get(key) ?? 0;
      projectedRevenue += expected;
      cum += expected - exp;
      // Errors accumulate with the square root of time, not linearly.
      const spread = noise * Math.sqrt(i);
      points.push({ date: key, net: Math.round(cum), lo: Math.round(cum - spread), band: Math.round(spread * 2) });
    }

    const expTotal = expenses.reduce((s, o) => s + o.amount, 0);
    const upcoming = expenses.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

    return {
      points,
      expTotal,
      revProjected: projectedRevenue,
      net: projectedRevenue - expTotal,
      dailyRevenue: baseline,
      recurringRevenueTotal: recurringRevenue.reduce((s, o) => s + o.amount, 0),
      trendPerDay: baseline > 0 ? drift / Math.max(1, days) : 0,
      confidence: baseline > 0 ? Math.max(0, Math.min(100, 100 - (noise / baseline) * 35)) : 0,
      upcoming,
    };
  }, [recQ.data, recRevQ.data, revQ.data, today, horizonEnd, days]);

  const trendLabel =
    model.trendPerDay > 0.5 ? "trending up" : model.trendPerDay < -0.5 ? "trending down" : "flat trend";

  return (
    <div className="card-surface p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">Cash-flow forecast</h3>
          <p className="text-xs text-muted-foreground">
            Next {days} days · learned from weekday patterns ({fmtMoney(model.dailyRevenue)}/day base, {trendLabel})
          </p>
        </div>
        <div className={cn("num text-right text-xl font-semibold", model.net >= 0 ? "text-emerald-500" : "text-rose-500")}>
          {fmtMoney(model.net)}
          <div className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">Projected net</div>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={model.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cfFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v: string) => v.slice(5)}
              minTickGap={32}
            />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={60} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: any, name: any) =>
                name === "band" || name === "lo" ? [fmtMoney(Number(v)), name === "lo" ? "Low case" : "Range"] : fmtMoney(Number(v))
              }
            />
            {/* Confidence band drawn as an invisible floor plus a stacked range. */}
            <Area type="monotone" dataKey="lo" stackId="band" stroke="none" fill="transparent" />
            <Area type="monotone" dataKey="band" stackId="band" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.12} />
            <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" fill="url(#cfFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 @[42rem]:grid-cols-4">
        <Mini label="Projected income" value={fmtMoney(model.revProjected)} tone="text-emerald-500" />
        <Mini label="Scheduled costs" value={fmtMoney(model.expTotal)} tone="text-rose-500" />
        <Mini label="Contracted income" value={fmtMoney(model.recurringRevenueTotal)} />
        <Mini label="Model confidence" value={`${model.confidence.toFixed(0)}%`} />
      </div>

      {model.upcoming.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Next scheduled payments</p>
          <ul className="divide-y divide-border/60 text-sm">
            {model.upcoming.map((o, i) => (
              <li
                key={`${o.name}-${o.date}-${i}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-1.5"
              >
                <span className="truncate">{o.name}</span>
                <span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
                  <span className="num tabular-nums text-rose-500">{fmtMoney(o.amount)}</span>
                  <span className="num text-xs tabular-nums text-muted-foreground">{shortDate(o.date)}</span>
                </span>
              </li>
            ))}
          </ul>

        </div>
      )}
    </div>
  );
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {

  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <p className="text-[10px] leading-tight uppercase tracking-wider text-muted-foreground" title={label}>
        {label}
      </p>
      <p className={cn("num mt-1 truncate text-[15px] font-semibold tabular-nums", tone)} title={value}>
        {value}
      </p>
    </div>
  );
}

