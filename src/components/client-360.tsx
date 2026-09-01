import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote, CheckCircle2, Flag, ListTodo, Mail, MessageCircle, Phone, ShieldCheck,
  Sparkles, TrendingUp, UserPlus, Users, Cpu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { toDisplay } from "@/lib/fx";
import { KYC_ITEMS, parseKyc } from "@/lib/kyc";
import { activationDate, stdDepositsFor } from "@/lib/rules";

const sb = supabase as any;

export type Client360Category = "financial" | "comms" | "tasks" | "kyc" | "people" | "system";

export const CATEGORY_LABEL: Record<Client360Category, string> = {
  financial: "Financial",
  comms: "Communications",
  tasks: "Tasks",
  kyc: "KYC",
  people: "Employee actions",
  system: "System",
};

type Ev = {
  id: string;
  /** ISO datetime (or date) used for sorting. */
  at: string;
  category: Client360Category;
  icon: typeof Phone;
  tone: string;
  title: string;
  detail?: string | null;
  amount?: number | null;
  balance?: number | null;
  who?: string | null;
};

const fmtWhen = (iso: string) => {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dateStr = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  return iso.length <= 10
    ? dateStr
    : `${dateStr}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * Client 360 — one filterable stream of everything that ever happened to a client:
 * money, conversations, tasks, compliance, people and system milestones.
 */
export function Client360Timeline({
  client,
  deposits,
  withdrawals,
  comms,
  employeeName,
}: {
  client: any;
  deposits: any[];
  withdrawals: any[];
  comms: any[];
  employeeName: (id?: string | null) => string;
}) {
  const id = client?.id as string | undefined;
  const [active, setActive] = useState<Client360Category[]>([]);

  const tasksQ = useQuery({
    queryKey: ["client360-tasks", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("tasks")
        .select("id,title,status,priority,due_date,created_at,completed_at,employee_id")
        .eq("activation_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const commentsQ = useQuery({
    queryKey: ["client360-comments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("record_comments")
        .select("id,body,user_email,created_at")
        .eq("entity_type", "client")
        .eq("entity_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const events = useMemo<Ev[]>(() => {
    if (!client) return [];
    const out: Ev[] = [];
    const act = activationDate(client as any);
    const opening = Number(client.balance || 0);

    // ---- System: lead intake ----
    const entryDate = client.daily_lead_entries?.entry_date;
    if (entryDate) {
      out.push({
        id: "lead", at: entryDate, category: "system", icon: UserPlus, tone: "text-muted-foreground",
        title: "Lead received",
        detail: client.daily_lead_entries?.lead_sources?.name ?? null,
      });
    }

    // ---- People: assignment ----
    if (client.employee_id) {
      out.push({
        id: "assigned", at: act ?? entryDate ?? client.created_at, category: "people", icon: Users,
        tone: "text-sky-500", title: "Assigned to agent", who: employeeName(client.employee_id),
      });
    }
    if (client.conversion_employee_id) {
      out.push({
        id: "conv-agent", at: act ?? client.created_at, category: "people", icon: Users,
        tone: "text-sky-500", title: "Conversion agent", who: employeeName(client.conversion_employee_id),
      });
    }

    // ---- Financial ----
    if (act) {
      out.push({
        id: "activation", at: act, category: "financial", icon: Flag, tone: "text-primary",
        title: "Activated — opening credit", amount: opening || null,
      });
    }
    let running = opening;
    const money = [
      ...deposits.map((d: any) => ({
        id: `dep-${d.id}`, at: String(d.date), delta: toDisplay(d.amount, d.currency),
        title: "Deposit",
        detail: [d.method, d.method_provider, d.notes].filter(Boolean).join(" · ") || null,
        who: employeeName(d.employee_id),
      })),
      ...withdrawals.map((w: any) => ({
        id: `wd-${w.id}`, at: String(w.date), delta: -toDisplay(w.amount, w.currency),
        title: "Withdrawal", detail: w.notes ?? null, who: employeeName(w.employee_id),
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    for (const m of money) {
      running += m.delta;
      out.push({
        id: m.id, at: m.at, category: "financial",
        icon: m.delta < 0 ? Banknote : TrendingUp,
        tone: m.delta < 0 ? "text-rose-500" : "text-emerald-500",
        title: m.title, detail: m.detail, amount: m.delta, balance: running, who: m.who,
      });
    }

    // ---- System: qualification milestones ----
    if (client.qualified_at) {
      out.push({
        id: "ftd", at: String(client.qualified_at), category: "system", icon: CheckCircle2,
        tone: "text-emerald-500", title: "Qualified as FTD",
      });
    }
    const stds = stdDepositsFor(client as any, deposits as any);
    stds.forEach((s: any, i) => {
      out.push({
        id: `std-${s.id ?? i}`, at: String(s.date), category: "system", icon: Sparkles,
        tone: "text-emerald-500", title: `Repeat deposit (STD${stds.length > 1 ? ` #${i + 1}` : ""})`,
        amount: toDisplay(s.amount, s.currency),
      });
    });
    if (client.ai_analyzed_at) {
      out.push({
        id: "ai", at: String(client.ai_analyzed_at), category: "system", icon: Cpu, tone: "text-primary",
        title: "AI analysis run",
        detail: client.ai_risk_label ? `Attention: ${client.ai_risk_label}` : null,
      });
    }

    // ---- Communications ----
    for (const c of comms) {
      const icon = c.channel === "email" ? Mail : c.channel === "whatsapp" ? MessageCircle : c.channel === "meeting" ? Users : Phone;
      out.push({
        id: `comm-${c.id}`, at: String(c.occurred_at), category: "comms", icon, tone: "text-sky-500",
        title: `${c.channel} · ${c.direction}`, detail: c.summary ?? null,
      });
    }

    // ---- Tasks ----
    for (const t of tasksQ.data ?? []) {
      out.push({
        id: `task-${t.id}`, at: String(t.created_at), category: "tasks", icon: ListTodo,
        tone: "text-amber-500", title: `Task created — ${t.title}`,
        detail: [t.priority ? `${t.priority} priority` : null, t.due_date ? `due ${t.due_date}` : null].filter(Boolean).join(" · ") || null,
        who: t.employee_id ? employeeName(t.employee_id) : null,
      });
      if (t.completed_at) {
        out.push({
          id: `task-done-${t.id}`, at: String(t.completed_at), category: "tasks", icon: CheckCircle2,
          tone: "text-emerald-500", title: `Task completed — ${t.title}`,
        });
      }
    }

    // ---- KYC ----
    const kyc = parseKyc(client.kyc);
    for (const item of KYC_ITEMS) {
      const e = kyc[item.key];
      if (e?.done && e.at) {
        out.push({
          id: `kyc-${item.key}`, at: String(e.at), category: "kyc", icon: ShieldCheck,
          tone: "text-emerald-500", title: `${item.label} ✓`, who: e.by ?? null,
        });
      }
    }

    // ---- People: comments ----
    for (const c of commentsQ.data ?? []) {
      out.push({
        id: `cmt-${c.id}`, at: String(c.created_at), category: "people", icon: MessageCircle,
        tone: "text-muted-foreground", title: "Comment", detail: c.body, who: c.user_email ?? null,
      });
    }

    return out
      .filter((e) => !!e.at)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [client, deposits, withdrawals, comms, tasksQ.data, commentsQ.data, employeeName]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [events]);

  const shown = active.length ? events.filter((e) => active.includes(e.category)) : events;

  const toggle = (k: Client360Category) =>
    setActive((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Client 360</h2>
          <p className="text-xs text-muted-foreground">
            Every event on this client — money, conversations, tasks, compliance and system milestones.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {shown.length} of {events.length} events
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant={active.length ? "outline" : "secondary"}
          className="h-7 rounded-full px-3 text-xs"
          onClick={() => setActive([])}
        >
          All
        </Button>
        {(Object.keys(CATEGORY_LABEL) as Client360Category[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={active.includes(k) ? "secondary" : "outline"}
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => toggle(k)}
            disabled={!counts[k]}
          >
            {CATEGORY_LABEL[k]}
            <Badge variant="outline" className="ml-1.5 h-4 border-0 bg-foreground/5 px-1 text-[10px]">
              {counts[k] ?? 0}
            </Badge>
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded for this filter yet.</p>
      ) : (
        <ol className="relative ml-2 border-l border-border pl-5">
          {shown.map((e) => {
            const Icon = e.icon;
            return (
              <li key={e.id} className="mb-3.5 last:mb-0">
                <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
                  <Icon className={cn("h-2.5 w-2.5", e.tone)} />
                </span>
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{e.title}</p>
                    {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                    {e.who && <p className="text-xs text-muted-foreground">by {e.who}</p>}
                  </div>
                  <div className="whitespace-nowrap text-xs text-muted-foreground">
                    {e.amount != null && (
                      <span className={cn("mr-2 num", e.amount < 0 ? "text-rose-500" : "text-emerald-500")}>
                        {e.amount < 0 ? "−" : "+"}{fmtMoney(Math.abs(e.amount))}
                      </span>
                    )}
                    {e.balance != null && <span className="mr-2 num">bal {fmtMoney(e.balance)}</span>}
                    {fmtWhen(String(e.at))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
