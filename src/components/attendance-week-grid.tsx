/**
 * Weekly attendance grid — the whole team's week at a glance, editable in place.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

type Emp = { id: string; name: string };
type Att = { employee_id: string; date: string; present: boolean };

const DAY_COUNT = 7;

export function AttendanceWeekGrid({ employees }: { employees: Emp[] }) {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const days = useMemo(() => {
    const all = Array.from({ length: DAY_COUNT }, (_, i) => addDays(anchor, i));
    // Never mix months in one view: keep the month that owns most of the week.
    const counts = new Map<string, number>();
    all.forEach((d) => {
      const k = format(d, "yyyy-MM");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    let best = format(all[0], "yyyy-MM");
    for (const [k, n] of counts) {
      const bestN = counts.get(best) ?? 0;
      if (n > bestN || (n === bestN && k > best)) best = k;
    }
    return all.filter((d) => format(d, "yyyy-MM") === best);
  }, [anchor]);
  const startISO = format(days[0], "yyyy-MM-dd");
  const endISO = format(days[days.length - 1], "yyyy-MM-dd");

  const weekQ = useQuery({
    queryKey: ["attendance", "week", startISO],
    queryFn: async () => {
      const data = await fetchAll(() =>
        supabase.from("attendance").select("employee_id,date,present").gte("date", startISO).lte("date", endISO),
      );
      return (data ?? []) as Att[];
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, boolean>();
    (weekQ.data ?? []).forEach((a) => m.set(`${a.employee_id}|${a.date}`, a.present));
    return m;
  }, [weekQ.data]);

  const setStatus = useMutation({
    mutationFn: async ({ employee_id, date, present }: Att) => {
      const { error } = await supabase
        .from("attendance")
        .upsert({ employee_id, date, present }, { onConflict: "employee_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  /** Cycles: unmarked → present → absent → unmarked. */
  const cycle = (employee_id: string, date: string) => {
    const cur = map.get(`${employee_id}|${date}`);
    if (cur === undefined) setStatus.mutate({ employee_id, date, present: true });
    else if (cur) setStatus.mutate({ employee_id, date, present: false });
    else {
      supabase
        .from("attendance")
        .delete()
        .eq("employee_id", employee_id)
        .eq("date", date)
        .then(({ error }) => {
          if (error) toast.error(error.message);
          else qc.invalidateQueries({ queryKey: ["attendance"] });
        });
    }
  };

  if (employees.length === 0) {
    return <EmptyState icon={Users} title="No employees" description="Add employees first to track attendance." />;
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAnchor(addDays(anchor, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {format(days[0], "MMM d")} – {format(days[days.length - 1], "MMM d, yyyy")}
        </span>
        <Button variant="outline" size="sm" onClick={() => setAnchor(addDays(anchor, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        >
          This week
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Click a cell to cycle present → absent → unmarked
        </span>
      </div>

      <div className="card-surface overflow-x-auto scroll-slim">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-head border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-3 px-4 text-left font-medium">Employee</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="py-3 px-2 text-center font-medium">
                  <div>{format(d, "EEE")}</div>
                  <div className="text-[11px] font-normal opacity-70">{format(d, "d MMM")}</div>
                </th>
              ))}
              <th className="py-3 px-4 text-center font-medium">Absent</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const absent = days.filter((d) => map.get(`${e.id}|${format(d, "yyyy-MM-dd")}`) === false).length;
              return (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="py-2 px-4 font-medium">{e.name}</td>
                  {days.map((d) => {
                    const iso = format(d, "yyyy-MM-dd");
                    const state = map.get(`${e.id}|${iso}`);
                    return (
                      <td key={iso} className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => cycle(e.id, iso)}
                          aria-label={`${e.name} on ${iso}: ${state === undefined ? "unmarked" : state ? "present" : "absent"}`}
                          className={cn(
                            "mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                            state === undefined && "border-dashed border-border text-muted-foreground hover:bg-accent/40",
                            state === true && "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                            state === false && "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300",
                          )}
                        >
                          {state === undefined ? "–" : state ? "P" : "A"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-2 px-4 text-center font-medium tabular-nums">{absent}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
