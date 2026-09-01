/**
 * Dense operator-style grid for the Clients page.
 *
 * One tight row per client, a filter box under every column header, and the
 * fields agents change all day (status, agents, answered) editable in place.
 */
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ContactActions } from "@/components/contact-actions";
import { FavoriteStar } from "@/components/favorite-star";
import { TagBadges } from "@/components/client-tags";
import { AnsweredBadge } from "@/components/status-badge";
import { StatusBadge } from "@/components/client-profile-fields";
import { TableFrame } from "@/components/table-frame";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { CLIENT_STATUSES } from "@/lib/client-profile";
import { fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const ANY = "all";
const NONE = "__none__";

export type GridFilters = {
  name: string;
  source: string;
  retention: string;
  conversion: string;
  status: string;
  answered: string;
  potential: string;
  balanceMin: string;
  balanceMax: string;
};

const EMPTY: GridFilters = {
  name: "", source: "", retention: ANY, conversion: ANY, status: ANY,
  answered: ANY, potential: ANY, balanceMin: "", balanceMax: "",
};

export type GridHelpers = {
  employeeName: (id?: string | null) => string;
  netBalance: (r: any) => number;
  sourceName: (r: any) => string;
};

export function useClientsGridFilters() {
  const [filters, setFilters] = usePersistedState<GridFilters>("activations:grid-filters", EMPTY);
  const set = useCallback(
    (patch: Partial<GridFilters>) => setFilters((prev) => ({ ...EMPTY, ...prev, ...patch })),
    [setFilters],
  );
  const clear = useCallback(() => setFilters(EMPTY), [setFilters]);
  const active = useMemo(
    () => (Object.keys(EMPTY) as (keyof GridFilters)[]).some((k) => (filters?.[k] ?? EMPTY[k]) !== EMPTY[k]),
    [filters],
  );
  const apply = useCallback(
    (rows: any[], h: GridHelpers) => {
      const f = { ...EMPTY, ...(filters ?? EMPTY) };
      const name = f.name.trim().toLowerCase();
      const source = f.source.trim().toLowerCase();
      const min = f.balanceMin === "" ? null : Number(f.balanceMin);
      const max = f.balanceMax === "" ? null : Number(f.balanceMax);
      return rows.filter((r) => {
        if (name && !(r.lead_name ?? "").toLowerCase().includes(name)) return false;
        if (source && !h.sourceName(r).toLowerCase().includes(source)) return false;
        if (f.retention !== ANY && (r.employee_id ?? NONE) !== f.retention) return false;
        if (f.conversion !== ANY && (r.conversion_employee_id ?? NONE) !== f.conversion) return false;
        if (f.status !== ANY && (r.status ?? NONE) !== f.status) return false;
        if (f.answered !== ANY && String(!!r.answered) !== f.answered) return false;
        if (f.potential !== ANY && (r.potential ?? NONE) !== f.potential) return false;
        if (min != null && Number.isFinite(min) && h.netBalance(r) < min) return false;
        if (max != null && Number.isFinite(max) && h.netBalance(r) > max) return false;
        return true;
      });
    },
    [filters],
  );
  return { filters: { ...EMPTY, ...(filters ?? EMPTY) }, set, clear, active, apply };
}

const TH = "whitespace-nowrap py-2 px-2 text-left font-medium";
const TD = "whitespace-nowrap py-1.5 px-2";

export function ClientsGrid({
  rows,
  employees,
  scoped,
  selected,
  onToggleSelected,
  onTogglePage,
  filters,
  helpers,
  onOpen,
  onEdit,
  onDelete,
  onPatch,
}: {
  rows: any[];
  employees: { id: string; name: string; active: boolean; team?: string | null }[];
  scoped: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  onTogglePage: (checked: boolean) => void;
  filters: ReturnType<typeof useClientsGridFilters>;
  helpers: GridHelpers;
  onOpen: (r: any) => void;
  onEdit: (r: any) => void;
  onDelete: (id: string) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
}) {
  const f = filters.filters;
  const retentionAgents = employees.filter((e) => e.team === "R");
  const conversionAgents = employees.filter((e) => e.team === "C");

  const agentOptions = (list: typeof employees, current?: string | null) => {
    const out = list.filter((e) => e.active !== false);
    if (current && !out.some((e) => e.id === current)) {
      const found = employees.find((e) => e.id === current);
      if (found) out.unshift(found);
    }
    return out;
  };

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <TableFrame fit="scroll" resizeKey="clients-grid">
      <table className="w-full table-auto text-xs">
        <thead className="table-head bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className={cn(TH, "w-10 pin-left left-0")}>
              <Checkbox checked={allChecked} onCheckedChange={(c) => onTogglePage(Boolean(c))} aria-label="Select all on page" />
            </th>
            <th className={cn(TH, "w-8 pin-left left-9")}></th>
            <th className={cn(TH, "pin-left left-[68px] min-w-[190px] bg-muted/40")}>Full name</th>
            <th className={cn(TH, "w-[120px]")}>Contact</th>
            <th className={TH}>Activated</th>
            <th className={TH}>Source</th>
            <th className={TH}>Retention</th>
            <th className={TH}>Conversion</th>
            <th className={TH}>Status</th>
            <th className={TH}>Answered</th>
            <th className={cn(TH, "text-right")}>Balance</th>
            <th className={TH}>Potential</th>
            <th className={TH}>Tags</th>
            <th className={cn(TH, "text-right")}>Actions</th>
          </tr>
          <tr className="bg-background/60">
            <th className="px-2 pb-2 pin-left left-0" />
            <th className="px-2 pb-2 pin-left left-9" />
            <th className="px-2 pb-2 pin-left left-[68px] bg-background/60">
              <Input
                className="h-7 text-xs"
                placeholder="Search"
                value={f.name}
                onChange={(e) => filters.set({ name: e.target.value })}
              />
            </th>
            <th className="px-2 pb-2" />
            <th className="px-2 pb-2" />
            <th className="px-2 pb-2">
              <Input
                className="h-7 text-xs"
                placeholder="Search"
                value={f.source}
                onChange={(e) => filters.set({ source: e.target.value })}
              />
            </th>
            <th className="px-2 pb-2">
              <Select value={f.retention} onValueChange={(v) => filters.set({ retention: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All</SelectItem>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {retentionAgents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </th>
            <th className="px-2 pb-2">
              <Select value={f.conversion} onValueChange={(v) => filters.set({ conversion: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All</SelectItem>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {conversionAgents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </th>
            <th className="px-2 pb-2">
              <Select value={f.status} onValueChange={(v) => filters.set({ status: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All</SelectItem>
                  <SelectItem value={NONE}>No status</SelectItem>
                  {CLIENT_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </th>
            <th className="px-2 pb-2">
              <Select value={f.answered} onValueChange={(v) => filters.set({ answered: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All</SelectItem>
                  <SelectItem value="true">Answered</SelectItem>
                  <SelectItem value="false">Not answered</SelectItem>
                </SelectContent>
              </Select>
            </th>
            <th className="px-2 pb-2">
              <div className="flex items-center gap-1">
                <Input
                  className="h-7 w-16 text-xs"
                  placeholder="Min"
                  inputMode="numeric"
                  value={f.balanceMin}
                  onChange={(e) => filters.set({ balanceMin: e.target.value })}
                />
                <Input
                  className="h-7 w-16 text-xs"
                  placeholder="Max"
                  inputMode="numeric"
                  value={f.balanceMax}
                  onChange={(e) => filters.set({ balanceMax: e.target.value })}
                />
              </div>
            </th>
            <th className="px-2 pb-2">
              <Select value={f.potential} onValueChange={(v) => filters.set({ potential: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All</SelectItem>
                  <SelectItem value={NONE}>—</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="mid">Mid</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </th>
            <th className="px-2 pb-2" />
            <th className="px-2 pb-2 text-right">
              {filters.active && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={filters.clear}>
                  Clear
                </Button>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={cn(
                "border-t border-border/60 odd:bg-muted/10 hover:bg-accent/30",
                selected.has(r.id) && "bg-accent/40",
              )}
            >
              <td className={cn(TD, "pin-left left-0")}>
                <Checkbox
                  checked={selected.has(r.id)}
                  onCheckedChange={() => onToggleSelected(r.id)}
                  aria-label={`Select ${r.lead_name ?? "client"}`}
                />
              </td>
              <td className={cn(TD, "pin-left left-9")}>
                <FavoriteStar type="client" id={r.id} label={r.lead_name} />
              </td>
              <td className={cn(TD, "pin-left left-[68px] font-medium")}>
                <button type="button" className="max-w-[220px] truncate text-left hover:underline" onClick={() => onOpen(r)}>
                  {r.lead_name || "Unnamed client"}
                </button>
              </td>
              <td className={TD}>
                <ContactActions phone={r.phone} email={r.email} name={r.lead_name} size="icon" />
              </td>
              <td className={TD}>
                {r.activation_date ?? r.daily_lead_entries?.entry_date
                  ? fmtDate((r.activation_date ?? r.daily_lead_entries?.entry_date)!)
                  : "—"}
              </td>
              <td className={TD}>{helpers.sourceName(r) || "—"}</td>
              <td className={TD}>
                {scoped ? (
                  helpers.employeeName(r.employee_id)
                ) : (
                  <Select
                    value={r.employee_id ?? NONE}
                    onValueChange={(v) => onPatch(r.id, { employee_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger className="h-7 w-[150px] border-transparent bg-transparent text-xs hover:border-border">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Unassigned</SelectItem>
                      {agentOptions(retentionAgents, r.employee_id).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </td>
              <td className={TD}>
                <Select
                  value={r.conversion_employee_id ?? NONE}
                  onValueChange={(v) => onPatch(r.id, { conversion_employee_id: v === NONE ? null : v })}
                >
                  <SelectTrigger className="h-7 w-[150px] border-transparent bg-transparent text-xs hover:border-border">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {agentOptions(conversionAgents, r.conversion_employee_id).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className={TD}>
                <Select
                  value={r.status ?? NONE}
                  onValueChange={(v) => onPatch(r.id, { status: v === NONE ? null : v })}
                >
                  <SelectTrigger className="h-7 w-[130px] border-transparent bg-transparent text-xs hover:border-border">
                    <SelectValue placeholder="—">
                      <StatusBadge status={r.status} />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {CLIENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className={TD}>
                <button
                  type="button"
                  aria-pressed={!!r.answered}
                  title={r.answered ? "Click to mark as unanswered" : "Click to mark as answered"}
                  className="rounded-full transition hover:opacity-80"
                  onClick={() => onPatch(r.id, { answered: !r.answered })}
                >
                  <AnsweredBadge answered={!!r.answered} />
                </button>
              </td>
              <td className={cn(TD, "num text-right font-medium")}>{fmtMoney(helpers.netBalance(r))}</td>
              <td className={cn(TD, "capitalize")}>{r.potential ?? "—"}</td>
              <td className={cn(TD, "max-w-[180px] truncate")}><TagBadges tags={r.tags} /></td>
              <td className={cn(TD, "text-right")}>
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onEdit(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpen(r)}>Open</Button>
                  <ConfirmDelete
                    onConfirm={() => onDelete(r.id)}
                    label={`Delete ${r.lead_name || "this client"}?`}
                    description="The client record is removed permanently. Deposits and withdrawals stay in Revenue and Withdrawals."
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
