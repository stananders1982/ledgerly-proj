/**
 * Due-date reminders for tasks.
 *
 * Once a day, any task that is due today or overdue and still open produces a
 * single notification so nothing quietly slips past the team.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const STAMP_KEY = "ledgerly:task-reminders";

export function TaskReminders() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(STAMP_KEY) === today) return;
      // Stamp immediately so remounts/tabs don't race into duplicate inserts.
      localStorage.setItem(STAMP_KEY, today);
    } catch {
      return;
    }

    (async () => {
      // Cross-device guard: skip if today's reminder already exists.
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("type", "task_due")
        .gte("created_at", `${today}T00:00:00Z`)
        .limit(1);
      if (existing?.length) return;

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id,title,due_date,status,client_name")
        .neq("status", "done")
        .not("due_date", "is", null)
        .lte("due_date", today);

      if (!tasks?.length) return;

      const { data: cid } = await supabase.rpc("current_company_id");
      const overdue = tasks.filter((t: any) => t.due_date < today).length;

      await supabase.from("notifications").insert({
        type: "task_due",
        title: overdue
          ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} need attention`
          : `${tasks.length} task${tasks.length === 1 ? "" : "s"} due today`,
        body: tasks
          .slice(0, 5)
          .map((t: any) => `${t.title}${t.client_name ? ` — ${t.client_name}` : ""}`)
          .join(" · "),
        company_id: cid as any,
      } as any);

      qc.invalidateQueries({ queryKey: ["notifications"] });
    })().catch(() => {
      /* reminders are best-effort */
    });
  }, [user, qc]);


  return null;
}
