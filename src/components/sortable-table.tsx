import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type SortState = { key: string; dir: "asc" | "desc" } | null;

function isEmpty(v: any) {
  return v === null || v === undefined || v === "";
}

export function useSort<T>(
  rows: T[],
  accessors: Record<string, (r: T) => any>,
  initial: SortState = null,
) {
  const [sort, setSort] = useState<SortState>(initial);

  const toggle = (key: string) =>
    setSort((s) =>
      s && s.key === key
        ? s.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" },
    );

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const acc = accessors[sort.key];
    if (!acc) return rows;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      const ea = isEmpty(va);
      const eb = isEmpty(vb);
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      if (typeof va === "boolean" || typeof vb === "boolean")
        return ((va ? 1 : 0) - (vb ? 1 : 0)) * mul;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
      return (
        String(va).localeCompare(String(vb), undefined, { numeric: true }) * mul
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  return { sorted, sort, toggle };
}

export function SortTh({
  label,
  k,
  sort,
  toggle,
  className = "py-3 px-4",
}: {
  label: string;
  k: string;
  sort: SortState;
  toggle: (key: string) => void;
  className?: string;
}) {
  const active = sort?.key === k;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle(k);
        }}
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {label}
        {active ? (
          sort!.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}
