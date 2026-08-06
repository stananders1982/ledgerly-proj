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
  const [filters, setFilters] = useState<Record<string, string>>({});

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
        return col.filter === "select"
          ? v === f
          : v.toLowerCase().includes(f.toLowerCase());
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
        <th key={c.key} className="px-2 py-2 align-middle font-normal">
          {c.filter === "none" || !c.value ? null : c.filter === "select" ? (
            <Select
              value={tb.filters[c.key] ?? ALL}
              onValueChange={(v) => tb.setFilter(c.key, v)}
            >
              <SelectTrigger className="h-8 min-w-[7rem] text-xs normal-case">
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
          ) : (
            <Input
              value={tb.filters[c.key] ?? ""}
              onChange={(e) => tb.setFilter(c.key, e.target.value)}
              placeholder="Search"
              className="h-8 min-w-[6rem] text-xs normal-case"
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
