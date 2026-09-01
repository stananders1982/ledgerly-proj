/**
 * Permission-aware data helpers for the Business assistant.
 *
 * Every query runs through the caller's Supabase client, so RLS policies
 * (company scoping, role filters, etc.) automatically limit what the model sees.
 */
import { loadFxRates } from "@/lib/fx.server";
import { depositMatchesActivation, stdDepositsFor } from "@/lib/rules";
import type { BusinessContext } from "@/lib/business-chat.server";

const SUPPORTED = ["USD", "EUR", "GBP", "AUD", "NZD"] as const;

async function loadConverter(ctx: BusinessContext) {
  const { data: settings } = await ctx.supabase
    .from("company_settings")
    .select("currency")
    .maybeSingle();
  const workspaceCurrency = (settings?.currency as string) || "USD";
  const rates = await loadFxRates().catch(() => null);
  return {
    workspaceCurrency,
    convert: (amount: number, currency?: string | null) => {
      if (!rates) return amount;
      const c = (currency || workspaceCurrency) as string;
      if (c === workspaceCurrency) return amount;
      const from = rates.table[c]?.[workspaceCurrency];
      if (!from) return amount;
      return amount * from;
    },
    fmt: (amount: number) => {
      const symbol = workspaceCurrency === "USD" ? "$" : workspaceCurrency === "EUR" ? "€" : workspaceCurrency === "GBP" ? "£" : "";
      return `${symbol}${Math.round(amount).toLocaleString()} ${workspaceCurrency}`;
    },
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function getSummary(ctx: BusinessContext, startIso?: string, endIso?: string) {
  const { convert, fmt } = await loadConverter(ctx);
  const start = startIso || daysAgo(30);
  const end = endIso || todayIso();

  const [{ data: revenue }, { data: expenses }, { data: withdrawals }, { data: activations }] = await Promise.all([
    ctx.supabase.from("revenue").select("date,amount,currency").gte("date", start).lte("date", end),
    ctx.supabase.from("expenses").select("date,amount,currency").gte("date", start).lte("date", end),
    ctx.supabase.from("withdrawals").select("date,amount,currency,status").gte("date", start).lte("date", end),
    ctx.supabase.from("daily_lead_activations").select("id,activation_date,qualified_at,employee_id,lead_name").eq("legacy", false).gte("activation_date", start).lte("activation_date", end),
  ]);

  const revenueTotal = (revenue ?? []).reduce((s, r) => s + convert(Number(r.amount || 0), r.currency), 0);
  const expenseTotal = (expenses ?? []).reduce((s, e) => s + convert(Number(e.amount || 0), e.currency), 0);
  const withdrawalTotal = (withdrawals ?? []).reduce((s, w) => s + convert(Number(w.amount || 0), w.currency), 0);
  const pendingWithdrawals = (withdrawals ?? []).filter((w) => w.status !== "paid" && w.status !== "rejected").length;

  const activationRows = (activations ?? []) as any[];
  const allRevenue = await ctx.supabase
    .from("revenue")
    .select("amount,currency,date,activation_id,customer_name")
    .gte("date", start)
    .lte("date", end);
  const revRows = (allRevenue.data ?? []) as any[];

  let ftds = 0;
  let stds = 0;
  for (const a of activationRows) {
    const mine = revRows.filter((r) => depositMatchesActivation(r, a));
    if (mine.length > 0) ftds += 1;
    stds += stdDepositsFor(a, mine as any).length;
  }

  return {
    period: { start, end },
    revenue: fmt(revenueTotal),
    expenses: fmt(expenseTotal),
    profit: fmt(revenueTotal - expenseTotal),
    withdrawals: fmt(withdrawalTotal),
    pendingWithdrawalCount: pendingWithdrawals,
    activatedClients: activationRows.length,
    ftds,
    stds,
  };
}

export async function listClients(
  ctx: BusinessContext,
  filters: {
    minDeposit?: number;
    maxDaysSinceContact?: number;
    valueTier?: string;
    neglected?: boolean;
    limit?: number;
    start?: string;
    end?: string;
  } = {},
) {
  const { convert, fmt } = await loadConverter(ctx);
  const limit = Math.min(filters.limit ?? 25, 50);

  let q = ctx.supabase
    .from("daily_lead_activations")
    .select(
      "id,lead_name,activation_date,answered,qualified_at,status,potential,potential_value,country,employee_id,conversion_employee_id,next_follow_up",
    )
    .eq("legacy", false)
    .order("activation_date", { ascending: false })
    .limit(200);

  if (filters.start) q = q.gte("activation_date", filters.start);
  if (filters.end) q = q.lte("activation_date", filters.end);

  const { data: activations } = await q;
  const ids = (activations ?? []).map((a: any) => a.id);
  const names = (activations ?? []).map((a: any) => a.lead_name).filter(Boolean);

  const { data: revenue } = await ctx.supabase
    .from("revenue")
    .select("amount,currency,date,activation_id,customer_name")
    .or(`activation_id.in.(${ids.join(",")}),customer_name.in.(${names.map((n) => `"${n}"`).join(",")})`);
  const revRows = (revenue ?? []) as any[];

  const { data: comms } = await ctx.supabase
    .from("client_communications")
    .select("activation_id,occurred_at")
    .in("activation_id", ids)
    .order("occurred_at", { ascending: false });
  const lastContact = new Map<string, string>();
  for (const c of (comms ?? []) as any[]) {
    if (!lastContact.has(c.activation_id)) lastContact.set(c.activation_id, c.occurred_at);
  }

  const now = new Date();
  const rows = (activations ?? []).map((a: any) => {
    const mine = revRows.filter((r) => depositMatchesActivation(r, a));
    const totalDeposit = mine.reduce((s, r) => s + convert(Number(r.amount || 0), r.currency), 0);
    const ftdDate = mine[0]?.date ?? null;
    const stdCount = stdDepositsFor(a, mine as any).length;
    const last = lastContact.get(a.id);
    const daysSince = last ? Math.floor((now.getTime() - new Date(last).getTime()) / 86400000) : null;
    const tier = tierFromValue(a.potential_value);
    return {
      id: a.id,
      name: a.lead_name ?? "Unnamed",
      activationDate: a.activation_date,
      valueTier: tier,
      potentialValue: a.potential_value != null ? fmt(convert(Number(a.potential_value), null)) : null,
      depositTotal: fmt(totalDeposit),
      depositCount: mine.length,
      ftdDate,
      stdCount,
      answered: !!a.answered,
      qualified: !!a.qualified_at,
      country: a.country,
      daysSinceContact: daysSince,
      neglected: isNeglected({ startDate: a.activation_date, depositDates: mine.map((m) => m.date), contactDates: last ? [last.slice(0, 10)] : [] }),
    };
  });

  let filtered = rows;
  if (filters.minDeposit) filtered = filtered.filter((r) => parseMoney(r.depositTotal) >= filters.minDeposit!);
  if (filters.valueTier) filtered = filtered.filter((r) => r.valueTier.toLowerCase() === filters.valueTier!.toLowerCase());
  if (filters.neglected) filtered = filtered.filter((r) => r.neglected);
  if (filters.maxDaysSinceContact != null)
    filtered = filtered.filter((r) => r.daysSinceContact != null && r.daysSinceContact >= filters.maxDaysSinceContact!);

  return filtered.slice(0, limit);
}

export async function listEmployees(ctx: BusinessContext, startIso?: string, endIso?: string) {
  const { convert } = await loadConverter(ctx);
  const start = startIso || daysAgo(30);
  const end = endIso || todayIso();

  const { data: employees } = await ctx.supabase.rpc("list_employees_directory");
  const { data: revenue } = await ctx.supabase
    .from("revenue")
    .select("date,amount,currency,employee_id,employee_id_2,split_pct")
    .gte("date", start)
    .lte("date", end);
  const { data: activations } = await ctx.supabase
    .from("daily_lead_activations")
    .select("activation_date,conversion_employee_id,employee_id")
    .eq("legacy", false)
    .gte("activation_date", start)
    .lte("activation_date", end);
  const { data: withdrawals } = await ctx.supabase
    .from("withdrawals")
    .select("date,amount,currency,employee_id")
    .gte("date", start)
    .lte("date", end);

  const revRows = (revenue ?? []) as any[];
  const actRows = (activations ?? []) as any[];
  const wdRows = (withdrawals ?? []) as any[];

  const byId = new Map<string, any>();
  for (const e of (employees ?? []) as any[]) {
    byId.set(e.id, { name: e.name, active: e.active, revenue: 0, ftds: 0, stds: 0, withdrawals: 0 });
  }

  for (const r of revRows) {
    const primary = byId.get(r.employee_id);
    const secondary = byId.get(r.employee_id_2);
    const split = Number(r.split_pct ?? 100);
    const amount = convert(Number(r.amount || 0), r.currency);
    if (primary) primary.revenue += amount * (split / 100);
    if (secondary) secondary.revenue += amount * ((100 - split) / 100);
  }

  for (const a of actRows) {
    const conversion = byId.get(a.conversion_employee_id);
    const retention = byId.get(a.employee_id);
    if (conversion) conversion.ftds += 1;
    if (retention) retention.stds += 1;
  }

  for (const w of wdRows) {
    const e = byId.get(w.employee_id);
    if (e) e.withdrawals += convert(Number(w.amount || 0), w.currency);
  }

  return Array.from(byId.values()).map((e) => ({
    name: e.name,
    active: e.active,
    revenue: Math.round(e.revenue),
    ftds: e.ftds,
    stds: e.stds,
    withdrawals: Math.round(e.withdrawals),
  }));
}

export async function listSources(ctx: BusinessContext, startIso?: string, endIso?: string) {
  const { convert, fmt } = await loadConverter(ctx);
  const start = startIso || daysAgo(30);
  const end = endIso || todayIso();

  const [{ data: sources }, { data: entries }, { data: revenue }] = await Promise.all([
    ctx.supabase.from("lead_sources").select("id,name,pricing_model,price,expected_conversion_rate"),
    ctx.supabase.from("daily_lead_entries").select("entry_date,received,activated,cost,source_id").gte("entry_date", start).lte("entry_date", end),
    ctx.supabase.from("revenue").select("amount,currency,date,activation_id").gte("date", start).lte("date", end),
  ]);

  const revRows = (revenue ?? []) as any[];
  const { data: activations } = await ctx.supabase
    .from("daily_lead_activations")
    .select("id,entry_id")
    .eq("legacy", false)
    .gte("activation_date", start)
    .lte("activation_date", end);
  const actToEntry = new Map((activations ?? []).map((a: any) => [a.id, a.entry_id]));

  const entryRows = (entries ?? []) as any[];
  const bySource = new Map<string, any>();
  for (const s of (sources ?? []) as any[]) {
    bySource.set(s.id, {
      name: s.name,
      leads: 0,
      activated: 0,
      cost: 0,
      revenue: 0,
      expectedRate: Number(s.expected_conversion_rate || 0),
    });
  }

  for (const e of entryRows) {
    const s = bySource.get(e.source_id);
    if (!s) continue;
    s.leads += Number(e.received || 0);
    s.activated += Number(e.activated || 0);
    s.cost += convert(Number(e.cost || 0), null);
  }

  for (const r of revRows) {
    const entryId = actToEntry.get(r.activation_id);
    const entry = entryRows.find((e) => e.id === entryId);
    if (!entry) continue;
    const s = bySource.get(entry.source_id);
    if (s) s.revenue += convert(Number(r.amount || 0), r.currency);
  }

  return Array.from(bySource.entries()).map(([id, s]) => ({
    id,
    name: s.name,
    leads: s.leads,
    activated: s.activated,
    conversionRate: s.leads > 0 ? Math.round((s.activated / s.leads) * 1000) / 10 : 0,
    expectedRate: Math.round(s.expectedRate * 1000) / 10,
    spend: fmt(s.cost),
    revenue: fmt(s.revenue),
    roi: s.cost > 0 ? Math.round(((s.revenue - s.cost) / s.cost) * 1000) / 10 : 0,
  }));
}

export async function listAffiliates(ctx: BusinessContext) {
  const { convert, fmt } = await loadConverter(ctx);
  const { data: affiliates } = await ctx.supabase.rpc("list_affiliates_directory");
  const { data: balances } = await ctx.supabase
    .from("affiliates")
    .select("id,opening_balance,balance_start_date,cpa_rate");

  const balanceById = new Map((balances ?? []).map((b: any) => [b.id, b]));
  const rows = (affiliates ?? []).map((a: any) => {
    const b = balanceById.get(a.id);
    return {
      id: a.id,
      name: a.name,
      active: a.active,
      openingBalance: b ? fmt(convert(Number(b.opening_balance || 0), null)) : fmt(0),
      cpaRate: b ? Number(b.cpa_rate || 0) : 0,
    };
  });
  return rows;
}

export async function comparePeriods(ctx: BusinessContext, periodA: { start: string; end: string }, periodB: { start: string; end: string }) {
  const [a, b] = await Promise.all([getSummary(ctx, periodA.start, periodA.end), getSummary(ctx, periodB.start, periodB.end)]);
  return { a, b };
}

export async function projectCashflow(ctx: BusinessContext, days = 90) {
  const { convert, fmt } = await loadConverter(ctx);
  const today = todayIso();
  const future = new Date();
  future.setDate(future.getDate() + days);
  const until = future.toISOString().slice(0, 10);

  const [{ data: recurringRevenue }, { data: recurringExpenses }, { data: employees }] = await Promise.all([
    ctx.supabase.from("recurring_revenue").select("next_due_date,amount,frequency").eq("active", true).lte("next_due_date", until),
    ctx.supabase.from("recurring_expenses").select("next_due_date,amount,frequency").eq("active", true).lte("next_due_date", until),
    ctx.supabase.from("employees").select("salary"),
  ]);

  const revenueSum = ((recurringRevenue ?? []) as any[]).reduce((s, r) => s + convert(Number(r.amount || 0), null), 0);
  const expenseSum = ((recurringExpenses ?? []) as any[]).reduce((s, e) => s + convert(Number(e.amount || 0), null), 0);
  const monthlyPayroll = (employees ?? []).reduce((s, e) => s + Number(e.salary || 0), 0);
  const months = days / 30;

  return {
    horizonDays: days,
    expectedRecurringIncome: fmt(revenueSum),
    expectedRecurringExpenses: fmt(expenseSum),
    projectedPayroll: fmt(monthlyPayroll * months),
    netBeforeDiscretionary: fmt(revenueSum - expenseSum - monthlyPayroll * months),
  };
}

export async function createTasks(ctx: BusinessContext, title: string, activationIds: string[]) {
  const { data: canManage } = await ctx.supabase.rpc("can_do", { _action: "manage_tasks" });
  if (!canManage) return { created: 0, error: "You do not have permission to create tasks." };

  const { data: acts } = await ctx.supabase
    .from("daily_lead_activations")
    .select("id,lead_name,company_id,employee_id")
    .in("id", activationIds);
  const rows = (acts ?? []).map((a: any) => ({
    company_id: a.company_id,
    title,
    activation_id: a.id,
    employee_id: a.employee_id,
    client_name: a.lead_name,
    priority: "high",
    status: "open",
    created_by: ctx.userId,
  }));
  if (!rows.length) return { created: 0, error: "No matching clients found." };

  const { error } = await ctx.supabase.from("tasks").insert(rows);
  if (error) return { created: 0, error: error.message };
  return { created: rows.length, error: null };
}

function tierFromValue(value: number | null) {
  if (value == null) return "unrated";
  if (value >= 100000) return "whale";
  if (value >= 50000) return "high";
  if (value >= 15000) return "mid";
  return "small";
}

function parseMoney(s: string) {
  return Number(s.replace(/[^0-9.-]/g, "")) || 0;
}

function isNeglected(opts: { startDate?: string | null; depositDates: string[]; contactDates: string[] }) {
  const { startDate, depositDates, contactDates } = opts;
  if (!startDate) return false;
  const lastDeposit = depositDates.length ? depositDates.sort()[depositDates.length - 1] : null;
  const lastContact = contactDates.length ? contactDates.sort()[contactDates.length - 1] : null;
  const lastActivity = lastDeposit && lastContact ? (lastDeposit > lastContact ? lastDeposit : lastContact) : lastDeposit || lastContact;
  if (!lastActivity) return false;
  const days = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000);
  return days > 14;
}
