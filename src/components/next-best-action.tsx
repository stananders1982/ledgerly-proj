import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock, CheckCircle2, ClipboardList, Mail, MessageCircle, Phone, StickyNote, Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate } from "@/lib/format";
import {
  NBA_URGENCY_LABEL, NBA_URGENCY_TONE, type NextBestAction,
} from "@/lib/next-best-action";

const sb = supabase as any;

const digits = (v?: string | null) => (v ? v.replace(/[^\d+]/g, "").replace(/^\+/, "") : "");

/**
 * The action card: what to do, why, what to say, and one click per channel.
 * Every outbound click also logs the touchpoint so the next recommendation
 * is computed from real activity instead of guesswork.
 */
export function NextBestActionCard({
  action,
  activationId,
  clientName,
  phone,
  email,
  currentFollowUp,
  onFollowUp,
}: {
  action: NextBestAction;
  activationId: string;
  clientName?: string | null;
  phone?: string | null;
  email?: string | null;
  currentFollowUp?: string | null;
  onFollowUp: (date: string | null) => void;
}) {
  const qc = useQueryClient();
  const [panel, setPanel] = useState<"none" | "task" | "note" | "followup">("none");
  const [taskTitle, setTaskTitle] = useState(action.taskTitle);
  const [taskDue, setTaskDue] = useState(action.followUp);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState(action.followUp);

  const logTouch = useMutation({
    mutationFn: async (v: { channel: string; summary: string | null }) => {
      const { error } = await sb.from("client_communications").insert({
        activation_id: activationId,
        client_name: clientName ?? null,
        channel: v.channel,
        direction: v.channel === "note" ? "internal" : "outbound",
        summary: v.summary,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      setPanel("none");
      qc.invalidateQueries({ queryKey: ["client-comms", activationId] });
      toast.success("Logged");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createTask = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("tasks").insert({
        title: taskTitle.trim() || action.taskTitle,
        notes: action.reasons.join(" "),
        due_date: taskDue || null,
        priority: action.urgency === "now" ? "high" : action.urgency === "monitor" ? "low" : "normal",
        status: "open",
        activation_id: activationId,
        client_name: clientName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPanel("none");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openChannel = (channel: "call" | "whatsapp" | "email") => {
    const p = digits(phone);
    const href =
      channel === "call"
        ? phone ? `tel:${phone}` : null
        : channel === "whatsapp"
          ? p ? `https://wa.me/${p}` : null
          : email ? `mailto:${email}` : null;
    if (!href) {
      toast.error(channel === "email" ? "No email address on file" : "No phone number on file");
      return;
    }
    window.open(href, channel === "whatsapp" ? "_blank" : "_self");
    logTouch.mutate({ channel, summary: `Opened ${channel} from Next Best Action` });
  };

  const s = action.stats;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Target className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-display text-base font-semibold">Next best action</h2>
        <Badge variant="outline" className={NBA_URGENCY_TONE[action.urgency]}>
          {NBA_URGENCY_LABEL[action.urgency]}
        </Badge>
      </div>

      <p className="mt-3 text-lg font-semibold">{action.headline}</p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {action.reasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Conversation angle</p>
        <p className="mt-1 text-sm leading-relaxed">{action.angle}</p>
      </div>

      {(s.avgInterval != null || s.daysSinceDeposit != null || s.daysSinceContact != null) && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini label="Avg gap" value={s.avgInterval != null ? `${s.avgInterval}d` : "—"} />
          <Mini label="Since deposit" value={s.daysSinceDeposit != null ? `${s.daysSinceDeposit}d` : "—"} />
          <Mini label="Since contact" value={s.daysSinceContact != null ? `${s.daysSinceContact}d` : "—"} />
          <Mini label="Overdue by" value={s.overdueBy != null && s.overdueBy > 0 ? `${s.overdueBy}d` : "—"} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant={action.channel === "call" ? "default" : "outline"} onClick={() => openChannel("call")}>
          <Phone className="mr-1.5 h-4 w-4" /> Call
        </Button>
        <Button size="sm" variant={action.channel === "whatsapp" ? "default" : "outline"} onClick={() => openChannel("whatsapp")}>
          <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
        </Button>
        <Button size="sm" variant={action.channel === "email" ? "default" : "outline"} onClick={() => openChannel("email")}>
          <Mail className="mr-1.5 h-4 w-4" /> Email
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPanel(panel === "task" ? "none" : "task")}>
          <ClipboardList className="mr-1.5 h-4 w-4" /> Create task
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPanel(panel === "note" ? "none" : "note")}>
          <StickyNote className="mr-1.5 h-4 w-4" /> Add note
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPanel(panel === "followup" ? "none" : "followup")}>
          <CalendarClock className="mr-1.5 h-4 w-4" /> Schedule follow-up
        </Button>
      </div>

      {currentFollowUp && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" /> Follow-up already set for {fmtDate(String(currentFollowUp).slice(0, 10))}
        </p>
      )}

      {panel === "task" && (
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
          <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" />
          <div className="flex items-center gap-2">
            <Input type="date" className="w-44" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
            <Button size="sm" disabled={createTask.isPending} onClick={() => createTask.mutate()}>
              {createTask.isPending ? "Creating…" : "Create task"}
            </Button>
          </div>
        </div>
      )}

      {panel === "note" && (
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you learn?" />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={logTouch.isPending || !note.trim()}
              onClick={() => logTouch.mutate({ channel: "note", summary: note.trim() })}
            >
              {logTouch.isPending ? "Saving…" : "Save note"}
            </Button>
          </div>
        </div>
      )}

      {panel === "followup" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
          <Input type="date" className="w-44" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          <Button size="sm" onClick={() => { onFollowUp(followUp || null); setPanel("none"); }}>Set follow-up</Button>
          {currentFollowUp && (
            <Button size="sm" variant="ghost" onClick={() => { onFollowUp(null); setPanel("none"); }}>Clear</Button>
          )}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num text-sm font-semibold">{value}</p>
    </div>
  );
}
