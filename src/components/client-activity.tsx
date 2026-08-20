import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Phone, MessageCircle, Mail, Users, Flag, TrendingUp, Banknote, UserPlus,
} from "lucide-react";

const sb = supabase as any;

export const COMM_CHANNELS = ["call", "whatsapp", "email", "meeting"] as const;

const CHANNEL_ICON: Record<string, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
};

export type Comm = {
  id: string;
  activation_id: string | null;
  channel: string;
  direction: string;
  summary: string | null;
  occurred_at: string;
};

export function useClientComms(activationId?: string | null) {
  return useQuery({
    queryKey: ["client-comms", activationId],
    enabled: !!activationId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("client_communications")
        .select("id,activation_id,channel,direction,summary,occurred_at")
        .eq("activation_id", activationId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Comm[];
    },
  });
}

/** Communication log for a single client: list + inline "log a touch" form. */
export function ClientCommunications({
  activationId,
  clientName,
}: {
  activationId: string;
  clientName?: string | null;
}) {
  const qc = useQueryClient();
  const q = useClientComms(activationId);
  const [channel, setChannel] = useState<string>("call");
  const [direction, setDirection] = useState<string>("outbound");
  const [summary, setSummary] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("client_communications").insert({
        activation_id: activationId,
        client_name: clientName ?? null,
        channel,
        direction,
        summary: summary.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSummary("");
      qc.invalidateQueries({ queryKey: ["client-comms", activationId] });
      toast.success("Logged");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Communication log</h3>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COMM_CHANNELS.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="outbound">Outbound</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="h-9 flex-1 min-w-[180px]"
          placeholder="What happened?"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !add.isPending) add.mutate(); }}
        />
        <Button size="sm" disabled={add.isPending} onClick={() => add.mutate()}>Log</Button>
      </div>

      {q.data && q.data.length > 0 ? (
        <ul className="space-y-2">
          {q.data.map((c) => {
            const Icon = CHANNEL_ICON[c.channel] ?? Phone;
            return (
              <li key={c.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm">
                <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium capitalize">
                    {c.channel} · <span className="text-xs font-normal text-muted-foreground capitalize">{c.direction}</span>
                  </p>
                  {c.summary && <p className="text-muted-foreground">{c.summary}</p>}
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(c.occurred_at).toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No communication logged yet.</p>
      )}
    </div>
  );
}

export type TimelineEvent = {
  date: string;
  kind: "lead" | "activation" | "deposit" | "withdrawal" | "comm";
  label: string;
  amount?: number;
  /** Running account balance right after this event. */
  balance?: number;
};

const KIND_META: Record<TimelineEvent["kind"], { icon: typeof Phone; tone: string }> = {
  lead: { icon: UserPlus, tone: "text-muted-foreground" },
  activation: { icon: Flag, tone: "text-primary" },
  deposit: { icon: TrendingUp, tone: "text-emerald-500" },
  withdrawal: { icon: Banknote, tone: "text-rose-500" },
  comm: { icon: Phone, tone: "text-sky-500" },
};

/** Vertical lifecycle timeline: lead → activation → deposits → withdrawals → touches. */
export function ClientTimeline({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].filter((e) => !!e.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return <p className="text-sm text-muted-foreground">No lifecycle events yet.</p>;
  return (
    <ol className="relative ml-2 border-l border-border pl-5">
      {sorted.map((e, i) => {
        const { icon: Icon, tone } = KIND_META[e.kind];
        return (
          <li key={`${e.kind}-${e.date}-${i}`} className="mb-3 last:mb-0">
            <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
              <Icon className={cn("h-2.5 w-2.5", tone)} />
            </span>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{e.label}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {e.amount != null && <span className={cn("mr-2 num", tone)}>{fmtMoney(e.amount)}</span>}
                {e.balance != null && (
                  <span className="mr-2 num text-muted-foreground">bal {fmtMoney(e.balance)}</span>
                )}
                {fmtDate(e.date.slice(0, 10))}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
