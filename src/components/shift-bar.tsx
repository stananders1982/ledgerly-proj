/**
 * Shift bar — the fast lane for mid-shift updates on the Leads page.
 *
 * Everything here writes to the same tables the full entry dialog uses
 * (`daily_lead_entries` + `daily_lead_activations`); it just removes the
 * dialog round-trip so counts can be bumped and FTDs named in seconds.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, UserPlus, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayISO } from "@/lib/format";
import { useCompanySettings } from "@/lib/settings";

type Source = { id: string; name: string };
type Employee = { id: string; name: string; active: boolean; team?: string | null };
type Entry = {
  id: string;
  entry_date: string;
  source_id: string | null;
  received: number;
  activated: number;
  reported: number;
  lead_sources?: { id: string; name: string } | null;
};
type Activation = {
  id: string;
  entry_id: string;
  employee_id: string;
  conversion_employee_id?: string | null;
  lead_name?: string | null;
  potential?: string | null;
  activation_date: string;
};

const COLLAPSE_KEY = "ledgerly:shift-bar-open";
const POTENTIALS = ["low", "mid", "high"] as const;

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      ["daily-leads-v2"],
      ["daily-lead-activations"],
      ["entries-for-sources"],
      ["dash-leads-v2"],
      ["unallocated-ftds"],
    ]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };
}

/** Number field that saves itself shortly after you stop typing. */
function CountField({
  label,
  value,
  onSave,
  quick = true,
}: {
  label: string;
  value: number;
  onSave: (n: number) => void;
  quick?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(String(value));
  }, [value]);

  const commit = (n: number) => {
    const safe = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
    dirty.current = false;
    setDraft(String(safe));
    if (safe !== value) onSave(safe);
  };

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => commit(Number(draft)), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        inputMode="numeric"
        aria-label={label}
        className="h-8 w-16 text-center tabular-nums"
        value={draft}
        onChange={(e) => {
          dirty.current = true;
          setDraft(e.target.value);
        }}
        onBlur={() => commit(Number(draft))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(Number(draft));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {quick && (
        <>
          <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs"
            onClick={() => commit(Number(draft || 0) + 1)}>+1</Button>
          <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs"
            onClick={() => commit(Number(draft || 0) + 5)}>+5</Button>
        </>
      )}
    </div>
  );
}

export function ShiftBar({
  entries,
  sources,
  employees,
  activations,
}: {
  entries: Entry[];
  sources: Source[];
  employees: Employee[];
  activations: Activation[];
}) {
  const today = todayISO();
  const invalidate = useInvalidate();
  const settings = useCompanySettings();
  const [open, setOpen] = useState(true);
  const [showFtd, setShowFtd] = useState(false);
  const [showList, setShowList] = useState(false);
  const [newSource, setNewSource] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(COLLAPSE_KEY);
      if (v !== null) setOpen(v === "1");
    } catch {
      /* storage unavailable — stay open */
    }
  }, []);
  const toggle = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const todayEntries = useMemo(
    () => entries.filter((e) => e.entry_date === today),
    [entries, today],
  );
  const todayEntryIds = useMemo(() => new Set(todayEntries.map((e) => e.id)), [todayEntries]);
  const todayActivations = useMemo(
    () =>
      activations.filter(
        (a) => a.activation_date === today || todayEntryIds.has(a.entry_id),
      ),
    [activations, today, todayEntryIds],
  );

  const retentionIds = useMemo(
    () => new Set(employees.filter((e) => e.team === "R").map((e) => e.id)),
    [employees],
  );
  const unallocated = todayActivations.filter((a) => !retentionIds.has(a.employee_id));

  // FTDs counted on the day's entry but never named — the gap the KPI card flags.
  const unnamed = todayEntries.reduce((sum, e) => {
    const named = todayActivations.filter((a) => a.entry_id === e.id).length;
    return sum + Math.max(0, Number(e.activated || 0) - named);
  }, 0);

  const totals = todayEntries.reduce(
    (acc, e) => ({
      received: acc.received + Number(e.received || 0),
      activated: acc.activated + Number(e.activated || 0),
      reported: acc.reported + Number(e.reported || 0),
    }),
    { received: 0, activated: 0, reported: 0 },
  );

  const patchEntry = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "received" | "activated" | "reported"; value: number }) => {
      const payload =
        field === "activated"
          ? { activated: value, converted: value }
          : field === "received"
            ? { received: value }
            : { reported: value };
      const { error } = await supabase.from("daily_lead_entries").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const addRow = useMutation({
    mutationFn: async (sourceId: string) => {
      const { error } = await supabase.from("daily_lead_entries").insert({
        entry_date: today,
        source_id: sourceId,
        received: 0,
        activated: 0,
        converted: 0,
        reported: 0,
        cost: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewSource("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not add the affiliate row"),
  });

  const [ftd, setFtd] = useState({
    lead_name: "",
    source_id: "",
    conversion_employee_id: "",
    employee_id: "",
    potential: "mid",
  });

  const addFtd = useMutation({
    mutationFn: async () => {
      if (!ftd.lead_name.trim()) throw new Error("Client name is required");
      if (!ftd.source_id) throw new Error("Pick the affiliate");
      if (!ftd.employee_id) throw new Error("Pick the retention agent");

      // Reuse today's entry for that affiliate, or open one on the fly.
      let entry = todayEntries.find((e) => e.source_id === ftd.source_id);
      if (!entry) {
        const { data, error } = await supabase
          .from("daily_lead_entries")
          .insert({ entry_date: today, source_id: ftd.source_id, received: 0, activated: 0, converted: 0, reported: 0, cost: 0 })
          .select("id, entry_date, source_id, received, activated, reported")
          .single();
        if (error) throw error;
        entry = data as Entry;
      }

      const { error: actErr } = await supabase.from("daily_lead_activations").insert({
        entry_id: entry.id,
        employee_id: ftd.employee_id,
        conversion_employee_id: ftd.conversion_employee_id || null,
        activated_count: 1,
        lead_name: ftd.lead_name.trim(),
        potential: ftd.potential || null,
        activation_date: today,
        balance: settings.defaultActivationBalance,
      });
      if (actErr) throw actErr;

      const nextActivated = Number(entry.activated || 0) + 1;
      const { error: upErr } = await supabase
        .from("daily_lead_entries")
        .update({ activated: nextActivated, converted: nextActivated })
        .eq("id", entry.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast.success("FTD added");
      setFtd((f) => ({ ...f, lead_name: "" }));
      invalidate();
      setTimeout(() => nameRef.current?.focus(), 30);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not add the FTD"),
  });

  const patchActivation = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { employee_id?: string; conversion_employee_id?: string | null; potential?: string | null };
    }) => {
      const { error } = await supabase.from("daily_lead_activations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const conversionAgents = employees.filter((e) => e.active && e.team === "C");
  const retentionAgents = employees.filter((e) => e.active && e.team === "R");
  const usedSourceIds = new Set(todayEntries.map((e) => e.source_id));
  const freeSources = sources.filter((s) => !usedSourceIds.has(s.id));
  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name ?? "No affiliate";

  const dateLabel = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="mb-4 rounded-xl border bg-card/80 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => toggle(!open)}
          className="flex items-center gap-1.5 text-sm font-semibold"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Today · {dateLabel}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>Received <span className="font-semibold tabular-nums text-foreground">{totals.received}</span></span>
          <span>FTDs <span className="font-semibold tabular-nums text-foreground">{totals.activated}</span></span>
          <span>Reported <span className="font-semibold tabular-nums text-foreground">{totals.reported}</span></span>
          {patchEntry.isPending || addFtd.isPending || addRow.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t px-4 py-3">
          {todayEntries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No entries logged for today yet — pick an affiliate below to start.
            </p>
          )}

          {todayEntries.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="min-w-32 text-sm font-medium">{e.lead_sources?.name ?? sourceName(e.source_id)}</span>
              <CountField label="Received" value={Number(e.received || 0)}
                onSave={(n) => patchEntry.mutate({ id: e.id, field: "received", value: n })} />
              <CountField label="Activated" value={Number(e.activated || 0)} quick={false}
                onSave={(n) => patchEntry.mutate({ id: e.id, field: "activated", value: n })} />
              <CountField label="Reported" value={Number(e.reported || 0)}
                onSave={(n) => patchEntry.mutate({ id: e.id, field: "reported", value: n })} />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {freeSources.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={newSource} onValueChange={(v) => { setNewSource(v); addRow.mutate(v); }}>
                  <SelectTrigger className="h-8 w-52 text-xs">
                    <SelectValue placeholder="+ add affiliate row" />
                  </SelectTrigger>
                  <SelectContent>
                    {freeSources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button type="button" size="sm" className="h-8" onClick={() => setShowFtd((v) => !v)}>
              <UserPlus className="mr-1 h-4 w-4" /> Add FTD
            </Button>

            {unnamed > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-amber-500/50 text-amber-700 dark:text-amber-400"
                onClick={() => setShowFtd(true)}
              >
                <AlertTriangle className="mr-1 h-4 w-4" /> {unnamed} unnamed FTD{unnamed === 1 ? "" : "s"}
              </Button>
            )}

            {unallocated.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-amber-500/50 text-amber-700 dark:text-amber-400"
                onClick={() => setShowList((v) => !v)}
              >
                <AlertTriangle className="mr-1 h-4 w-4" /> Unallocated {unallocated.length}
              </Button>
            )}

            {todayActivations.length > 0 && unallocated.length === 0 && (
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setShowList((v) => !v)}>
                Today's FTDs ({todayActivations.length})
              </Button>
            )}
          </div>

          {showFtd && (
            <form
              className="grid gap-3 rounded-lg border bg-muted/30 p-3 md:grid-cols-5"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (!addFtd.isPending) addFtd.mutate();
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") setShowFtd(false);
              }}
            >
              <div className="space-y-1">
                <Label className="text-xs">Client name</Label>
                <Input ref={nameRef} autoFocus className="h-8" value={ftd.lead_name}
                  onChange={(e) => setFtd({ ...ftd, lead_name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Affiliate</Label>
                <Select value={ftd.source_id} onValueChange={(v) => setFtd({ ...ftd, source_id: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Conversion agent</Label>
                <Select value={ftd.conversion_employee_id} onValueChange={(v) => setFtd({ ...ftd, conversion_employee_id: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {conversionAgents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Retention agent</Label>
                <Select value={ftd.employee_id} onValueChange={(v) => setFtd({ ...ftd, employee_id: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {retentionAgents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Potential</Label>
                <div className="flex gap-2">
                  <Select value={ftd.potential} onValueChange={(v) => setFtd({ ...ftd, potential: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POTENTIALS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm" className="h-8" disabled={addFtd.isPending}>
                    {addFtd.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {showList && todayActivations.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              {todayActivations.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-36 font-medium">{a.lead_name || "Unnamed client"}</span>
                  {!retentionIds.has(a.employee_id) && <Badge variant="destructive">Unallocated</Badge>}
                  <Select value={a.conversion_employee_id ?? ""}
                    onValueChange={(v) => patchActivation.mutate({ id: a.id, patch: { conversion_employee_id: v } })}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Conversion agent" /></SelectTrigger>
                    <SelectContent>
                      {conversionAgents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={retentionIds.has(a.employee_id) ? a.employee_id : ""}
                    onValueChange={(v) => patchActivation.mutate({ id: a.id, patch: { employee_id: v } })}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Retention agent" /></SelectTrigger>
                    <SelectContent>
                      {retentionAgents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={a.potential ?? ""}
                    onValueChange={(v) => patchActivation.mutate({ id: a.id, patch: { potential: v } })}>
                    <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Potential" /></SelectTrigger>
                    <SelectContent>
                      {POTENTIALS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
