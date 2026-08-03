import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateDueRecurringExpenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Verify caller is admin
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) return { count: 0 };

    const { data, error } = await context.supabase.rpc("generate_due_recurring_expenses");
    if (error) throw error;
    return { count: Number(data ?? 0) };
  });

export const generateDueRecurringRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw roleErr;
    if (!isAdmin) return { count: 0 };

    const { data, error } = await context.supabase.rpc("generate_due_recurring_revenue");
    if (error) throw error;
    return { count: Number(data ?? 0) };
  });
