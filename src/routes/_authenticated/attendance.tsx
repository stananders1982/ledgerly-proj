import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, CheckCircle2, XCircle, Users } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "Attendance — Ledgerly" }] }),
  component: AttendancePage,
});

type Emp = { id: string; name: string; salary: number; active: boolean };
type EmpRow = { id: string | null; name: string | null; active: boolean | null };
type Att = { id: string; employee_id: string; date: string; present: boolean };

// Mon–Fri working days in the month containing `d`
function workingDaysInMonth(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  let n = 0;
  for (let day = 1; day <= last; day++) {
    const w = new Date(y, m, day).getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

function AttendancePage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const isoDate = format(date, "yyyy-MM-dd");
  const monthStart = format(new Date(date.getFullYear(), date.getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(date.getFullYear(), date.getMonth() + 1, 0), "yyyy-MM-dd");

  const employeesQ = useQuery({
    queryKey: ["employees", "all", isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("employees").select("id,name,salary,active").order("active", { ascending: false }).order("name");
        if (error) throw error;
        return (data ?? []) as Emp[];
      }
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return ((data ?? []) as EmpRow[])
        .filter((r) => r.id && r.name)
        .map((r) => ({ id: r.id as string, name: r.name as string, salary: 0, active: r.active ?? true }));
    },
  });


  const dayQ = useQuery({
    queryKey: ["attendance", isoDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance").select("*").eq("date", isoDate);
      if (error) throw error;
      return (data ?? []) as Att[];
    },
  });

  const monthQ = useQuery({
    queryKey: ["attendance", "month", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance").select("employee_id,present,date")
        .gte("date", monthStart).lte("date", monthEnd);
      if (error) throw error;
      return (data ?? []) as Att[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ employee_id, present }: { employee_id: string; present: boolean }) => {
      const { error } = await supabase
        .from("attendance")
        .upsert({ employee_id, date: isoDate, present }, { onConflict: "employee_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", isoDate] });
      qc.invalidateQueries({ queryKey: ["attendance", "month", monthStart] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const bulkStatus = useMutation({
    mutationFn: async ({ present, ids }: { present: boolean; ids: string[] }) => {
      const rows = ids.map((employee_id) => ({ employee_id, date: isoDate, present }));
      const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "employee_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", isoDate] });
      qc.invalidateQueries({ queryKey: ["attendance", "month", monthStart] });
      toast.success("Attendance saved for everyone");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const employees = employeesQ.data ?? [];
  const dayMap = useMemo(() => {
    const m = new Map<string, boolean>();
    (dayQ.data ?? []).forEach((a) => m.set(a.employee_id, a.present));
    return m;
  }, [dayQ.data]);

  const wDays = workingDaysInMonth(date);
  const absentByEmp = useMemo(() => {
    const m = new Map<string, number>();
    (monthQ.data ?? []).forEach((a) => {
      if (!a.present) m.set(a.employee_id, (m.get(a.employee_id) ?? 0) + 1);
    });
    return m;
  }, [monthQ.data]);

  const totalPresent = (dayQ.data ?? []).filter((a) => a.present).length;
  const totalAbsent = (dayQ.data ?? []).filter((a) => !a.present).length;
  const unmarked = employees.length - dayMap.size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Mark daily presence. Absences are deducted from monthly salary based on working days (Mon–Fri)."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Date</CardTitle></CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                  <CalendarIcon className="h-4 w-4" />
                  {format(date, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Present</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-500">{totalPresent}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Absent</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-rose-500">{totalAbsent}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unmarked</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{unmarked}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Employees · {format(date, "EEEE, MMM d")}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkStatus.mutate({ present: true, ids: employees.map((e) => e.id) })}
              disabled={bulkStatus.isPending}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> Mark all present
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkStatus.mutate({ present: false, ids: employees.map((e) => e.id) })}
              disabled={bulkStatus.isPending}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5 text-rose-500" /> Mark all absent
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <EmptyState icon={Users} title="No active employees" description="Add employees first to track attendance." />
          ) : (
            <div className="divide-y divide-border/50">
              {employees.map((e) => {
                const marked = dayMap.has(e.id);
                const present = dayMap.get(e.id) ?? true;
                const absentDays = absentByEmp.get(e.id) ?? 0;
                const perDay = wDays > 0 ? e.salary / wDays : 0;
                const deduction = perDay * absentDays;
                return (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-[180px]">
                      <div className="font-medium">{e.name}</div>
                      {isAdmin && (
                        <div className="text-xs text-muted-foreground">
                          Salary {fmtMoney(e.salary)} · per day {fmtMoney(perDay)}
                        </div>
                      )}
                    </div>
                    {isAdmin ? (
                      <div className="text-xs text-muted-foreground">
                        Month: <span className="font-medium text-foreground">{absentDays}</span> absent ·
                        deduction <span className="font-medium text-rose-500">−{fmtMoney(deduction)}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Month: <span className="font-medium text-foreground">{absentDays}</span> absent
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      {marked ? (
                        present ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Present
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-rose-500">
                            <XCircle className="h-3.5 w-3.5" /> Absent
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">Not marked</span>
                      )}
                      <Switch
                        checked={marked ? present : true}
                        onCheckedChange={(v) => setStatus.mutate({ employee_id: e.id, present: v })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
