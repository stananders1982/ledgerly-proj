/**
 * Dashboard-wide period selector: presets plus a custom range calendar.
 *
 * The selection is persisted so the dashboard opens on the same period after a
 * refresh, and every preset knows what its "previous period" is, so the
 * period-over-period deltas compare like for like (this month vs last month).
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, Check, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DashRangeKey =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "custom";

export type DashRangeState = { key: DashRangeKey; start?: string; end?: string };

export const DASH_PRESETS: { key: DashRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_3_months", label: "Last 3 Months" },
  { key: "last_6_months", label: "Last 6 Months" },
  { key: "this_year", label: "This Year" },
  { key: "custom", label: "Custom Range" },
];

const STORAGE_KEY = "ledgerly.dashboard.range";

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => {
  // Weeks start on Monday.
  const s = startOfDay(d);
  const diff = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - diff);
  return s;
};

/** Resolve a selection into concrete start/end days plus its comparison period. */
export function resolveDashRange(state: DashRangeState): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  prevStartIso: string;
  prevEndIso: string;
  label: string;
} {
  const today = startOfDay(new Date());
  let start = today;
  let end = today;
  let prevStart: Date;
  let prevEnd: Date;

  switch (state.key) {
    case "today": {
      prevEnd = new Date(today); prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = prevEnd;
      break;
    }
    case "this_week": {
      start = startOfWeek(today);
      prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 6);
      break;
    }
    case "this_month": {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      prevEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    }
    case "last_month": {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      prevStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      prevEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
      break;
    }
    case "last_3_months": {
      start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      prevStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      prevEnd = new Date(today.getFullYear(), today.getMonth() - 2, 0);
      break;
    }
    case "last_6_months": {
      start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      prevStart = new Date(today.getFullYear(), today.getMonth() - 11, 1);
      prevEnd = new Date(today.getFullYear(), today.getMonth() - 5, 0);
      break;
    }
    case "this_year": {
      start = new Date(today.getFullYear(), 0, 1);
      prevStart = new Date(today.getFullYear() - 1, 0, 1);
      prevEnd = new Date(today.getFullYear() - 1, 11, 31);
      break;
    }
    case "custom":
    default: {
      const s = state.start ? new Date(state.start + "T00:00:00") : today;
      const e = state.end ? new Date(state.end + "T00:00:00") : s;
      start = s <= e ? s : e;
      end = s <= e ? e : s;
      const span = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
      prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (span - 1));
      break;
    }
  }

  return {
    start,
    end,
    startIso: isoDate(start),
    endIso: isoDate(end),
    prevStartIso: isoDate(prevStart),
    prevEndIso: isoDate(prevEnd),
    label: formatRangeLabel(start, end),
  };
}

/** "1 Jun – 30 Jun 2026" style label. */
export function formatRangeLabel(start: Date, end: Date): string {
  const day = (d: Date) => d.getDate();
  const mon = (d: Date) => d.toLocaleString(undefined, { month: "short" });
  if (isoDate(start) === isoDate(end)) return `${day(start)} ${mon(start)} ${start.getFullYear()}`;
  if (start.getFullYear() === end.getFullYear()) {
    return `${day(start)} ${mon(start)} – ${day(end)} ${mon(end)} ${end.getFullYear()}`;
  }
  return `${day(start)} ${mon(start)} ${start.getFullYear()} – ${day(end)} ${mon(end)} ${end.getFullYear()}`;
}

/** Selection state persisted to localStorage, defaulting to This Month. */
export function useDashRange() {
  const [state, setState] = useState<DashRangeState>({ key: "this_month" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DashRangeState;
      if (parsed?.key && DASH_PRESETS.some((p) => p.key === parsed.key)) setState(parsed);
    } catch {
      /* ignore unreadable storage */
    }
  }, []);

  const update = (next: DashRangeState) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore full/blocked storage */
    }
  };

  const resolved = useMemo(() => resolveDashRange(state), [state]);
  return { state, setState: update, ...resolved };
}

export function DashboardRangePicker({
  value,
  onChange,
  label,
}: {
  value: DashRangeState;
  onChange: (v: DashRangeState) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = DASH_PRESETS.find((p) => p.key === value.key)?.label ?? "Custom Range";
  const selected: DateRange | undefined = value.start
    ? { from: new Date(value.start + "T00:00:00"), to: value.end ? new Date(value.end + "T00:00:00") : undefined }
    : undefined;

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
      <span className="text-xs text-muted-foreground">
        Showing: <span className="font-medium text-foreground">{label}</span>
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-11 justify-between gap-2 font-normal sm:h-9">
            <CalendarIcon className="h-4 w-4 opacity-70" />
            {activeLabel}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <div className="flex flex-col sm:flex-row">
            <div className="flex min-w-[170px] flex-col p-2">
              {DASH_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    if (p.key === "custom") {
                      onChange({ key: "custom", start: value.start, end: value.end });
                      return;
                    }
                    onChange({ key: p.key });
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-11 items-center justify-between rounded-md px-3 text-sm transition-colors hover:bg-accent",
                    value.key === p.key && "bg-accent font-medium",
                  )}
                >
                  {p.label}
                  {value.key === p.key && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
            {value.key === "custom" && (
              <div className="border-t border-border sm:border-l sm:border-t-0">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  defaultMonth={selected?.from}
                  selected={selected}
                  onSelect={(r: DateRange | undefined) =>
                    onChange({
                      key: "custom",
                      start: r?.from ? isoDate(r.from) : undefined,
                      end: r?.to ? isoDate(r.to) : r?.from ? isoDate(r.from) : undefined,
                    })
                  }
                  className={cn("p-3 pointer-events-auto")}
                />
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
