import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ColDef<T> = {
  /** Stable key, also used for column visibility persistence. */
  key: string;
  label: string;
  /** Filter control rendered under the header. Defaults to "text". */
  filter?: "text" | "select" | "date" | "none";
  /** Value used for filtering and for building select options. */
  value?: (row: T) => unknown;
  /** Column can't be hidden (e.g. the primary name column). */
  locked?: boolean;
  /** Hidden by default on first load. */
  defaultHidden?: boolean;
};

const ALL = "__all__";

function str(v: unknown) {
  return v === null || v === undefined ? "" : String(v);
}

/** Normalise any displayable date value to a local `yyyy-mm-dd` key. */
export function dateKey(v: unknown): string {
  const s = str(v).trim();
  if (!s || s === "—") return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function keyToDate(key: string): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

const toKey = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Monday-based start of week. */
const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  return addDays(x, -day);
};

export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This week" },
  { value: "past-week", label: "Past week" },
  { value: "this-month", label: "This month" },
  { value: "past-month", label: "Past month" },
  { value: "custom", label: "Custom range" },
] as const;

/** Resolve a stored date-filter value into an inclusive [start, end] key range. */
export function dateFilterRange(v: string): { start: string; end: string } | null {
  if (!v) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (v.startsWith("custom:")) {
    const [, s, e] = v.split(":");
    if (!s && !e) return null;
    const a = s || e;
    const b = e || s;
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }
  switch (v) {
    case "today":
      return { start: toKey(today), end: toKey(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { start: toKey(y), end: toKey(y) };
    }
    case "this-week":
      return { start: toKey(startOfWeek(today)), end: toKey(today) };
    case "past-week": {
      const s = addDays(startOfWeek(today), -7);
      return { start: toKey(s), end: toKey(addDays(s, 6)) };
    }
    case "this-month":
      return {
        start: toKey(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: toKey(today),
      };
    case "past-month": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: toKey(s), end: toKey(e) };
    }
    default: {
      // Legacy single-day keys (yyyy-mm-dd).
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { start: v, end: v };
      return null;
    }
  }
}

function dateFilterLabel(v: string): string {
  if (!v) return "Any date";
  if (v.startsWith("custom:")) {
    const r = dateFilterRange(v);
    if (!r) return "Custom range";
    const f = (k: string) => keyToDate(k)?.toLocaleDateString() ?? k;
    return r.start === r.end ? f(r.start) : `${f(r.start)} – ${f(r.end)}`;
  }
  const p = DATE_PRESETS.find((x) => x.value === v);
  if (p) return p.label;
  return keyToDate(v)?.toLocaleDateString() ?? "Any date";
}



export function useTableToolbox<T>(
  storageKey: string,
  cols: ColDef<T>[],
  rows: T[],
  opts?: {
    /** Rows searched instead of `rows` when one of `allTimeKeys` has a filter. */
    allTimeRows?: T[];
    allTimeKeys?: string[];
  },
) {
  const lsKey = `table-cols:${storageKey}`;
  const [hidden, setHidden] = useState<string[]>(() => {
    if (typeof window === "undefined") return cols.filter((c) => c.defaultHidden).map((c) => c.key);
    try {
      const raw = window.localStorage.getItem(lsKey);
      if (raw) return JSON.parse(raw) as string[];
    } catch {
      /* ignore */
    }
    return cols.filter((c) => c.defaultHidden).map((c) => c.key);
  });
  const filtersKey = `table-filters:${storageKey}`;
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Remember column filters between visits (hydrated after mount to stay SSR-safe).
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(filtersKey);
      if (raw) setFilters(JSON.parse(raw) as Record<string, string>);
    } catch {
      /* ignore */
    }
    setFiltersHydrated(true);
  }, [filtersKey]);

  useEffect(() => {
    if (!filtersHydrated) return;
    try {
      window.localStorage.setItem(filtersKey, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters, filtersKey, filtersHydrated]);

  useEffect(() => {
    try {
      window.localStorage.setItem(lsKey, JSON.stringify(hidden));
    } catch {
      /* ignore */
    }
  }, [hidden, lsKey]);


  const show = (key: string) => !hidden.includes(key);

  const toggleColumn = (key: string) =>
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const setFilter = (key: string, v: string) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (!v || v === ALL) delete next[key];
      else next[key] = v;
      return next;
    });

  const clearFilters = () => setFilters({});

  const activeFilterCount = Object.keys(filters).length;

  const filtered = useMemo(() => {
    const entries = Object.entries(filters);
    if (!entries.length) return rows;
    const useAllTime =
      opts?.allTimeRows && (opts.allTimeKeys ?? []).some((k) => filters[k]);
    const base = useAllTime ? opts!.allTimeRows! : rows;
    return base.filter((r) =>
      entries.every(([key, f]) => {
        const col = cols.find((c) => c.key === key);
        if (!col?.value) return true;
        const v = str(col.value(r));
        if (col.filter === "select") return v === f;
        if (col.filter === "date") {
          const range = dateFilterRange(f);
          if (!range) return true;
          const k = dateKey(v);
          return !!k && k >= range.start && k <= range.end;
        }
        return v.toLowerCase().includes(f.toLowerCase());

      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, opts?.allTimeRows]);

  const optionsFor = (col: ColDef<T>) => {
    if (!col.value) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const v = str(col.value(r));
      if (v) set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  return {
    cols,
    hidden,
    show,
    toggleColumn,
    setHidden,
    filters,
    setFilter,
    clearFilters,
    activeFilterCount,
    filtered,
    optionsFor,
  };
}

export type TableToolbox<T> = ReturnType<typeof useTableToolbox<T>>;

export function ColumnsMenu<T>({ tb, className }: { tb: TableToolbox<T>; className?: string }) {
  const hiddenCount = tb.hidden.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className}>
          <Settings2 className="h-4 w-4" /> Columns
          {hiddenCount > 0 && (
            <span className="ml-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
              {hiddenCount} hidden
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tb.cols.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.key}
            checked={tb.show(c.key)}
            disabled={c.locked}
            onCheckedChange={() => tb.toggleColumn(c.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => tb.setHidden([])}>Show all</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Preset dropdown + custom range picker used for date columns. */
export function DateFilter({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isCustom = value.startsWith("custom:");
  const range = isCustom ? dateFilterRange(value) : null;
  const selectedRange = range
    ? { from: keyToDate(range.start), to: keyToDate(range.end) }
    : undefined;

  return (
    <div className="flex items-center gap-1">
      <Select
        value={isCustom ? "custom" : value || ALL}
        onValueChange={(v) => {
          if (v === ALL) onChange("");
          else if (v === "custom") {
            onChange("custom::");
            setOpen(true);
          } else onChange(v);
        }}
      >
        <SelectTrigger className={cn("h-8 w-full min-w-[5.5rem] text-xs normal-case", className)}>
          <SelectValue placeholder="Any date" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL}>Any date</SelectItem>
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isCustom && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-8 w-full min-w-[6rem] justify-start gap-1 px-2 text-xs font-normal normal-case",
                !range && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{range ? dateFilterLabel(value) : "Pick range"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={selectedRange as never}
              onSelect={(r: { from?: Date; to?: Date } | undefined) => {
                const from = r?.from ? dateKey(r.from) : "";
                const to = r?.to ? dateKey(r.to) : "";
                onChange(`custom:${from}:${to}`);
                if (from && to) setOpen(false);
              }}
              numberOfMonths={2}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      )}

      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => onChange("")}
          aria-label="Clear date filter"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}



/**
 * Second header row with a search box / dropdown under each visible column.
 * `leading` / `trailing` add empty cells for checkbox and action columns.
 */
export function FilterRow<T>({
  tb,
  leading = 0,
  trailing = 0,
}: {
  tb: TableToolbox<T>;
  leading?: number;
  trailing?: number;
}) {
  const visible = tb.cols.filter((c) => tb.show(c.key));
  return (
    <tr className="border-b border-border bg-muted/30">
      {Array.from({ length: leading }).map((_, i) => (
        <th key={`l${i}`} className="px-2 py-2" />
      ))}
      {visible.map((c) => (
        <th key={c.key} className="px-1.5 py-2 align-middle font-normal">
          {c.filter === "none" || !c.value ? null : c.filter === "select" ? (
            <Select
              value={tb.filters[c.key] ?? ALL}
              onValueChange={(v) => tb.setFilter(c.key, v)}
            >
              <SelectTrigger className="h-8 w-full min-w-[5rem] text-xs normal-case">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL}>All</SelectItem>
                {tb.optionsFor(c).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : c.filter === "date" ? (
            <DateFilter
              value={tb.filters[c.key] ?? ""}
              onChange={(v) => tb.setFilter(c.key, v)}
            />
          ) : (
            <Input
              value={tb.filters[c.key] ?? ""}
              onChange={(e) => tb.setFilter(c.key, e.target.value)}
              placeholder="Search"
              className="h-8 w-full min-w-[4.5rem] text-xs normal-case"
            />
          )}

        </th>
      ))}
      {Array.from({ length: trailing }).map((_, i) => (
        <th key={`t${i}`} className="px-2 py-2" />
      ))}
    </tr>
  );
}

/**
 * Footer row that totals numeric columns for the rows currently in view.
 * Pass a `total` function on the columns you want summed; the rest render blank.
 */
export function TotalsRow<T>({
  tb,
  rows,
  totals,
  format = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 }),
  leading = 0,
  trailing = 0,
  label = "Total",
}: {
  tb: TableToolbox<T>;
  rows: T[];
  /** Column key -> value extractor. Only these columns get a total. */
  totals: Record<string, (row: T) => number>;
  format?: (n: number, key: string) => string;
  leading?: number;
  trailing?: number;
  label?: string;
}) {
  const visible = tb.cols.filter((c) => tb.show(c.key));
  const firstVisible = visible[0]?.key;
  return (
    <tfoot>
      <tr className="border-t border-border bg-muted/40 font-semibold">
        {Array.from({ length: leading }).map((_, i) => (
          <td key={`l${i}`} className="px-2 py-2" />
        ))}
        {visible.map((c) => {
          const fn = totals[c.key];
          if (!fn) {
            return (
              <td key={c.key} className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                {leading === 0 && c.key === firstVisible ? label : null}
              </td>
            );
          }
          const sum = rows.reduce((s, r) => s + (Number(fn(r)) || 0), 0);
          return (
            <td key={c.key} className="num px-4 py-2">
              {format(sum, c.key)}
            </td>
          );
        })}
        {Array.from({ length: trailing }).map((_, i) => (
          <td key={`t${i}`} className="px-2 py-2" />
        ))}
      </tr>
    </tfoot>
  );
}
