import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFxRates } from "@/lib/fx.server";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { z } from "zod";

const SUPPORTED = ["USD", "EUR", "GBP", "AUD", "NZD"] as const;

function toIso(d: Date) {
  return d.toISOString().split("T")[0];
}

function parseRange(input?: { start?: string; end?: string } | null) {
  const today = new Date();
  const start = input?.start ? new Date(input.start) : startOfDay(subDays(today, 30));
  const end = input?.end ? new Date(input.end) : endOfDay(today);
  return { start: toIso(start), end: toIso(end) };
}

function toUsd(amount: number | string | null | undefined, currency: string | null | undefined, workspace: string, rates: Record<string, Record<string, number>>) {
  const c = currency ?? workspace;
  if (!rates[c]) return Number(amount) || 0;
  const usdRate = rates[c]["USD"];
  if (!usdRate) return Number(amount) || 0;
  return (Number(amount) || 0) * usdRate;
}

export type DashboardConfig = {
  widgets: DashboardWidget[];
};

export type DashboardWidget = {
  id: string;
  type: keyof typeof widgetMeta;
  title?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

export const widgetMeta = {
  revenue: { title: "Revenue", w: 3, h: 2 },
  profit: { title: "Profit", w: 3, h: 2 },
  ftd: { title: "FTDs", w: 3, h: 2 },
  std: { title: "STDs", w: 3, h: 2 },
  withdrawals: { title: "Withdrawals", w: 3, h: 2 },
  expenses: { title: "Expenses", w: 3, h: 2 },
  cash: { title: "Cash position", w: 6, h: 3 },
  forecast: { title: "Cash forecast", w: 6, h: 3 },
  clients: { title: "Client health", w: 4, h: 3 },
  sources: { title: "Top sources", w: 4, h: 3 },
  employees: { title: "Top employees", w: 4, h: 3 },
  affiliates: { title: "Affiliate debt", w: 3, h: 2 },
  tasks: { title: "Overdue tasks", w: 3, h: 2 },
} as const;

export const listDashboards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: cid, error: cidErr } = await context.supabase.rpc("current_company_id");
    if (cidErr) throw cidErr;
    const { data, error } = await context.supabase
      .from("dashboards")
      .select("id, name, is_default, created_at, updated_at, user_id")
      .eq("company_id", cid)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: cid, error: cidErr } = await context.supabase.rpc("current_company_id");
    if (cidErr) throw cidErr;
    const { data: row, error } = await context.supabase
      .from("dashboards")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", cid)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const saveDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; name: string; config: DashboardConfig; is_default?: boolean }) => {
    const parsed = z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(100),
      config: z.object({ widgets: z.array(z.any()) }),
      is_default: z.boolean().optional(),
    }).parse(input);
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { data: cid, error: cidErr } = await context.supabase.rpc("current_company_id");
    if (cidErr) throw cidErr;

    const payload = {
      company_id: cid,
      user_id: context.userId,
      name: data.name,
      config: data.config as any,
      is_default: data.is_default ?? false,
    };

    if (data.id) {
      const { data: existing, error: fetchErr } = await context.supabase
        .from("dashboards")
        .select("user_id")
        .eq("id", data.id)
        .eq("company_id", cid)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing) throw new Error("Dashboard not found");
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (existing.user_id !== context.userId && !isAdmin) throw new Error("Forbidden");

      if (payload.is_default) {
        await context.supabase
          .from("dashboards")
          .update({ is_default: false })
          .eq("company_id", cid)
          .neq("id", data.id);
      }

      const { data: updated, error } = await context.supabase
        .from("dashboards")
        .update({ name: payload.name, config: payload.config, is_default: payload.is_default, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw error;
      return updated;
    }

    if (payload.is_default) {
      await context.supabase
        .from("dashboards")
        .update({ is_default: false })
        .eq("company_id", cid);
    }

    const { data: inserted, error } = await context.supabase
      .from("dashboards")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return inserted;
  });

export const deleteDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: cid, error: cidErr } = await context.supabase.rpc("current_company_id");
    if (cidErr) throw cidErr;
    const { data: existing, error: fetchErr } = await context.supabase
      .from("dashboards")
      .select("user_id")
      .eq("id", data.id)
      .eq("company_id", cid)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) throw new Error("Dashboard not found");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (existing.user_id !== context.userId && !isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("dashboards").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { start?: string; end?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { data: cid, error: cidErr } = await context.supabase.rpc("current_company_id");
    if (cidErr) throw cidErr;
    const { start, end } = parseRange(data);

    const [{ baseRates }, settingsRes, revenueRes, expensesRes, withdrawalsRes, activationsRes, recurringRevRes, recurringExpRes, sourceRes, employeeRes, clientRes, affiliateRes, taskRes] = await Promise.all([
      loadFxRates() as Promise<{ baseRates: Record<string, number> }>,
      context.supabase.from("company_settings").select("currency, whale_threshold").eq("company_id", cid).maybeSingle(),
      context.supabase.from("revenue").select("amount, currency, date").eq("company_id", cid).gte("date", start).lte("date", end),
      context.supabase.from("expenses").select("amount, currency, date").eq("company_id", cid).gte("date", start).lte("date", end),
      context.supabase.from("withdrawals").select("amount, currency, date, status").eq("company_id", cid).gte("date", start).lte("date", end),
      context.supabase.from("daily_lead_activations").select("id, activation_date, answered, potential, potential_value, lead_name").eq("company_id", cid).gte("activation_date", start).lte("activation_date", end).eq("legacy", false),
      context.supabase.from("recurring_revenue").select("amount, currency, next_due_date, frequency").eq("company_id", cid).eq("active", true),
      context.supabase.from("recurring_expenses").select("amount, currency, next_due_date, frequency").eq("company_id", cid).eq("active", true),
      context.supabase.from("lead_sources").select("id, name, pricing_model, price").eq("company_id", cid),
      context.supabase.rpc("list_employees_directory"),
      context.supabase.from("daily_lead_activations").select("id, lead_name, potential_value, activation_date").eq("company_id", cid).eq("legacy", false).order("activation_date", { ascending: false }),
      context.supabase.from("affiliate_events").select("amount, status").eq("company_id", cid),
      context.supabase.from("tasks").select("id, due_date, status, title").eq("company_id", cid).lt("due_date", toIso(new Date())).neq("status", "done"),
    ]);

    const workspace = settingsRes.data?.currency ?? "USD";
    const rates = (() => {
      const table: Record<string, Record<string, number>> = {};
      for (const base of SUPPORTED) {
        const row: Record<string, number> = {};
        for (const target of SUPPORTED) {
          const baseRate = baseRates[base];
          const targetRate = baseRates[target];
          row[target] = baseRate && targetRate ? targetRate / baseRate : 1;
        }
        table[base] = row;
      }
      return table;
    })();

    const revenue = (revenueRes.data ?? []).reduce((s, r) => s + toUsd(r.amount, r.currency, workspace, rates), 0);
    const expenses = (expensesRes.data ?? []).reduce((s, r) => s + toUsd(r.amount, r.currency, workspace, rates), 0);
    const withdrawals = (withdrawalsRes.data ?? []).reduce((s, r) => s + toUsd(r.amount, r.currency, workspace, rates), 0);
    const pendingWithdrawals = (withdrawalsRes.data ?? []).filter((w) => w.status === "requested" || w.status === "processing").reduce((s, r) => s + toUsd(r.amount, r.currency, workspace, rates), 0);
    const profit = revenue - expenses - withdrawals;

    const ftdCount = (activationsRes.data ?? []).filter((a) => a.answered).length;
    const stdCount = 0; // reserved: second-deposit logic lives client-side; this metric is intentionally conservative

    const today = toIso(new Date());
    const d7 = toIso(subDays(new Date(), -7));
    const d30 = toIso(subDays(new Date(), -30));
    const d90 = toIso(subDays(new Date(), -90));

    const recurringExpected = (date: string) =>
      (recurringRevRes.data ?? [])
        .filter((r) => r.next_due_date && r.next_due_date <= date)
        .reduce((s, r) => s + toUsd(r.amount, r.currency, workspace, rates), 0) -
      (recurringExpRes.data ?? [])
        .filter((r) => r.next_due_date && r.next_due_date <= date)
        .reduce((s, r) => s + toUsd(r.amount, r.currency, workspace, rates), 0);

    const cashToday = revenue + recurringExpected(today);
    const cash7 = cashToday + recurringExpected(d7);
    const cash30 = cashToday + recurringExpected(d30);
    const cash90 = cashToday + recurringExpected(d90);

    const committedExpenses = (recurringExpRes.data ?? [])
      .filter((r) => r.next_due_date && r.next_due_date <= d30)
      .reduce((s, r) => s + toUsd(r.amount, r.currency, workspace, rates), 0);

    const activeClients = new Set((clientRes.data ?? []).map((c) => c.lead_name?.toLowerCase().trim()).filter(Boolean));
    const whaleThreshold = Number(settingsRes.data?.whale_threshold ?? 0) || Infinity;
    const whaleCount = (clientRes.data ?? []).filter((c) => Number(c.potential_value ?? 0) >= whaleThreshold).length;
    const seenRecently = new Set((revenueRes.data ?? []).map((r) => r.customer_name?.toLowerCase().trim()).filter(Boolean));
    const neglectedCount = (clientRes.data ?? []).filter((c) => c.lead_name && !seenRecently.has(c.lead_name.toLowerCase().trim())).length;

    const sourceMap = new Map((sourceRes.data ?? []).map((s) => [s.id, s]));
    const topSources = (await context.supabase
      .from("leads")
      .select("source_id, status")
      .eq("company_id", cid)
      .gte("created_at", `${start}T00:00:00Z`)
      .lte("created_at", `${end}T23:59:59Z`))
      .data?.reduce((acc, l) => {
        const s = sourceMap.get(l.source_id ?? "");
        const name = s?.name ?? "Unknown";
        const entry = acc.get(name) ?? { name, leads: 0, conversions: 0, spend: 0 };
        entry.leads += 1;
        if (l.status === "activated") entry.conversions += 1;
        if (s?.pricing_model === "CPL") entry.spend += Number(s.price ?? 0);
        acc.set(name, entry);
        return acc;
      }, new Map<string, { name: string; leads: number; conversions: number; spend: number }>()) ?? new Map();

    const sourcesArray = Array.from(topSources.values())
      .map((s) => ({ ...s, roi: s.spend ? ((s.conversions * 250 - s.spend) / s.spend) * 100 : 0 }))
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 5);

    const employeeMap = new Map(((employeeRes.data as any[]) ?? []).map((e) => [e.id, e.name]));
    const employeeRevenue = (revenueRes.data ?? []).reduce((acc, r) => {
      const name = employeeMap.get(r.employee_id ?? "") ?? "Unknown";
      acc[name] = (acc[name] || 0) + toUsd(r.amount, r.currency, workspace, rates);
      return acc;
    }, {} as Record<string, number>);
    const employeesArray = Object.entries(employeeRevenue)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const affiliateDebt = (affiliateRes.data ?? [])
      .filter((e) => e.status === "approved")
      .reduce((s, r) => s + toUsd(r.amount, r.currency, workspace, rates), 0);

    return {
      revenue,
      expenses,
      profit,
      ftdCount,
      stdCount,
      withdrawals,
      pendingWithdrawals,
      cash: { today: cashToday, d7: cash7, d30: cash30, d90: cash90, committedExpenses },
      clients: { total: activeClients.size, whale: whaleCount, neglected: neglectedCount },
      sources: sourcesArray,
      employees: employeesArray,
      affiliateDebt,
      overdueTasks: (taskRes.data ?? []).length,
    };
  });
