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

/**
 * 90-day cash-flow forecast: projected recurring expenses (from their schedules)
 * against projected revenue (trailing 90-day daily average).
 */
export function CashflowForecast({ days = 90 }: { days?: number }) {
  const today = useMemo(() => new Date(), []);
  const horizonEnd = useMemo(() => iso(addDays(today, days)), [today, days]);
  const lookbackStart = useMemo(() => iso(addDays(today, -days)), [today, days]);

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
    // Projected recurring expense occurrences inside the horizon.
    const occurrences: { date: string; amount: number; name: string }[] = [];
    for (const r of recQ.data ?? []) {
      let d: string = r.next_due_date;
      let guard = 0;
      while (d && d <= horizonEnd && guard < 200) {
        if (!r.end_date || d <= r.end_date) {
          if (d >= start) occurrences.push({ date: d, amount: Number(r.amount || 0), name: r.name });
        }
        d = advance(d, String(r.frequency));
        guard++;
      }
    }

    const revTotal = (revQ.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const dailyRevenue = revTotal / days;

    const byDay = new Map<string, number>();
    for (const o of occurrences) byDay.set(o.date, (byDay.get(o.date) ?? 0) + o.amount);

    let cum = 0;
    const points: { date: string; net: number; expenses: number; revenue: number }[] = [];
    for (let i = 0; i <= days; i++) {
      const d = iso(addDays(today, i));
      const exp = byDay.get(d) ?? 0;
      cum += dailyRevenue - exp;
      points.push({ date: d, net: Math.round(cum), expenses: exp, revenue: dailyRevenue });
    }

    const expTotal = occurrences.reduce((s, o) => s + o.amount, 0);
    return {
      points,
      expTotal,
      revProjected: dailyRevenue * days,
      net: dailyRevenue * days - expTotal,
      dailyRevenue,
      upcoming: occurrences.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    };
  }, [recQ.data, revQ.data, today, horizonEnd, days]);

  return (
    <div className="card-surface p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">Cash-flow forecast</h3>
          <p className="text-xs text-muted-foreground">
            Next {days} days · recurring costs vs. projected income ({fmtMoney(model.dailyRevenue)}/day trailing average)
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
              formatter={(v: any) => fmtMoney(Number(v))}
            />
            <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" fill="url(#cfFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Mini label="Projected income" value={fmtMoney(model.revProjected)} tone="text-emerald-500" />
        <Mini label="Scheduled costs" value={fmtMoney(model.expTotal)} tone="text-rose-500" />
        <Mini label="Break-even/day" value={fmtMoney(model.expTotal / days)} />
      </div>

      {model.upcoming.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Next scheduled payments</p>
          <ul className="space-y-1 text-sm">
            {model.upcoming.map((o, i) => (
              <li key={`${o.name}-${o.date}-${i}`} className="flex items-center justify-between gap-3">
                <span className="truncate">{o.name}</span>
                <span className="whitespace-nowrap text-muted-foreground">
                  <span className="num mr-2 text-rose-500">{fmtMoney(o.amount)}</span>{o.date}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-base font-semibold", tone)}>{value}</p>
    </div>
  );
}
