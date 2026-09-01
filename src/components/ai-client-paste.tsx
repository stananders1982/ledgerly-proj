import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractClientsFromText, type ExtractedClient } from "@/lib/client-import.functions";
import { fmtMoney } from "@/lib/format";

const FIELD_LABELS: Record<string, string> = {
  lead_name: "Name",
  phone: "Phone",
  email: "Email",
  country: "Country",
  city: "City",
  language: "Language",
  gender: "Gender",
  date_of_birth: "Date of birth",
  age: "Age",
  occupation: "Occupation",
  status: "Status",
  tags: "Tags",
  notes: "Notes",
  next_follow_up: "Next follow-up",
  preferred_contact_time: "Preferred contact time",
  potential_value: "Potential value",
  net_worth: "Net worth",
  liquid_funds: "Liquid funds",
  monthly_income: "Monthly income",
  exposure_elsewhere: "Invested elsewhere",
  source_of_funds: "Source of funds",
  deposit_appetite: "Deposit appetite (1-5)",
};

const MONEY_FIELDS = new Set([
  "potential_value", "net_worth", "liquid_funds", "monthly_income", "exposure_elsewhere",
]);

function show(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (MONEY_FIELDS.has(field)) return fmtMoney(Number(value));
  return String(value);
}

const PLACEHOLDER =
  "Paste anything: a client card, an email, a chat log, notes or a copied table.\n\n" +
  "e.g. John Miller, 41, Sydney AU. Mobile +61 400 111 222, john@mail.com. Works as a dentist, " +
  "net worth ~1.2M, keeps around 80k liquid, already has 50k with another broker. Very keen, wants to " +
  "add funds next week. Call him in the evenings.";

/* ------------------------------------------------------------------ */
/* Single client — sits on the client page                             */
/* ------------------------------------------------------------------ */

export function AiClientPaste({
  current,
  onApply,
  applying,
}: {
  current: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
  applying?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExtractedClient | null>(null);
  const [unmapped, setUnmapped] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const extract = useServerFn(extractClientsFromText);
  const run = useMutation({
    mutationFn: () => extract({ data: { text, singleClient: true } }),
    onSuccess: (res) => {
      const c = res.clients[0] ?? null;
      setResult(c);
      setUnmapped(res.unmapped_notes);
      setPicked(Object.fromEntries(Object.keys(c ?? {}).map((k) => [k, true])));
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not read that text"),
  });

  const reset = () => { setText(""); setResult(null); setUnmapped(null); setPicked({}); };

  const rows = result ? Object.keys(result).filter((k) => k in FIELD_LABELS) : [];
  const chosen = rows.filter((k) => picked[k]);

  const apply = () => {
    if (!result) return;
    const patch: Record<string, unknown> = {};
    for (const k of chosen) patch[k] = (result as any)[k];
    onApply(patch);
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ClipboardPaste className="h-4 w-4" /> Paste from old CRM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Paste raw text — AI fills the details</DialogTitle></DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <Textarea
              rows={12}
              value={text}
              placeholder={PLACEHOLDER}
              onChange={(e) => setText(e.target.value)}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Nothing is saved until you review what the AI found and press Apply.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-[55vh] overflow-auto scroll-slim rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Apply</th>
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Current</th>
                    <th className="px-3 py-2 font-medium">Suggested</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((k) => (
                    <tr key={k} className="border-t border-border/50 align-top">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={!!picked[k]}
                          onCheckedChange={(v) => setPicked((p) => ({ ...p, [k]: !!v }))}
                        />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{FIELD_LABELS[k]}</td>
                      <td className="px-3 py-2 text-muted-foreground">{show(k, current[k])}</td>
                      <td className="px-3 py-2 font-medium">{show(k, (result as any)[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {unmapped && (
              <p className="rounded-lg border border-border bg-foreground/[0.02] p-3 text-xs text-muted-foreground">
                <span className="uppercase tracking-wide">Not stored automatically</span>
                <br />
                {unmapped}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="ghost" onClick={reset}>Paste something else</Button>
              <Button disabled={!chosen.length || applying} onClick={apply}>
                Apply {chosen.length} field{chosen.length === 1 ? "" : "s"}
              </Button>
            </>
          ) : (
            <Button disabled={run.isPending || text.trim().length < 5} onClick={() => run.mutate()}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {run.isPending ? "Reading…" : "Read with AI"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk — several clients in one paste                                 */
/* ------------------------------------------------------------------ */

type BulkRow = {
  data: ExtractedClient;
  matchId: string | null;
  matchName: string | null;
  include: boolean;
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function AiClientPasteBulk() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [unmapped, setUnmapped] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>("");

  const employeesQ = useQuery({
    queryKey: ["ai-paste-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean }[];
    },
    staleTime: 60_000,
  });

  const existingQ = useQuery({
    queryKey: ["ai-paste-existing-clients"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_lead_activations")
        .select("id,lead_name,phone,email");
      if (error) throw error;
      return (data ?? []) as { id: string; lead_name: string | null; phone: string | null; email: string | null }[];
    },
    staleTime: 30_000,
  });

  const extract = useServerFn(extractClientsFromText);
  const run = useMutation({
    mutationFn: () => extract({ data: { text } }),
    onSuccess: (res) => {
      const existing = existingQ.data ?? [];
      setRows(
        res.clients.map((c) => {
          const match =
            (c.phone && existing.find((e) => digits(e.phone) && digits(e.phone) === digits(c.phone))) ||
            (c.email && existing.find((e) => norm(e.email) && norm(e.email) === norm(c.email))) ||
            (c.lead_name && existing.find((e) => norm(e.lead_name) === norm(c.lead_name))) ||
            null;
          return {
            data: c,
            matchId: match ? match.id : null,
            matchName: match ? match.lead_name : null,
            include: true,
          };
        }),
      );
      setUnmapped(res.unmapped_notes);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not read that text"),
  });

  const chosen = (rows ?? []).filter((r) => r.include);
  const needsAgent = chosen.some((r) => !r.matchId);

  const save = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      for (const r of chosen) {
        if (r.matchId) {
          const { error } = await supabase
            .from("daily_lead_activations")
            .update(r.data as any)
            .eq("id", r.matchId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("daily_lead_activations").insert({
            ...(r.data as any),
            employee_id: agentId,
            activated_count: 1,
            activation_date: today,
          } as any);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activated-leads"] });
      qc.invalidateQueries({ queryKey: ["ai-paste-existing-clients"] });
      toast.success(`Saved ${chosen.length} client${chosen.length === 1 ? "" : "s"}`);
      setOpen(false);
      setText(""); setRows(null); setUnmapped(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const employees = useMemo(
    () => (employeesQ.data ?? []).filter((e) => e.active),
    [employeesQ.data],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setText(""); setRows(null); setUnmapped(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Sparkles className="h-4 w-4" /> Paste clients with AI</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Paste client text — AI creates the records</DialogTitle></DialogHeader>

        {!rows ? (
          <div className="space-y-3">
            <Textarea
              rows={12}
              value={text}
              placeholder={PLACEHOLDER}
              onChange={(e) => setText(e.target.value)}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Paste one client or many. You review everything before anything is saved.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-[50vh] space-y-2 overflow-auto scroll-slim pr-1">
              {rows.map((r, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={r.include}
                      onCheckedChange={(v) =>
                        setRows((prev) => (prev ?? []).map((x, j) => (j === i ? { ...x, include: !!v } : x)))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.data.lead_name ?? "Unnamed"}</span>
                        {r.matchId ? (
                          <Badge variant="secondary">Updates {r.matchName ?? "existing client"}</Badge>
                        ) : (
                          <Badge variant="default">New client</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {Object.keys(r.data)
                          .filter((k) => k in FIELD_LABELS && k !== "lead_name")
                          .map((k) => `${FIELD_LABELS[k]}: ${show(k, (r.data as any)[k])}`)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {needsAgent && (
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Assign new clients to</label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick an agent" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {unmapped && (
              <p className="rounded-lg border border-border bg-foreground/[0.02] p-3 text-xs text-muted-foreground">
                <span className="uppercase tracking-wide">Not stored automatically</span>
                <br />
                {unmapped}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {rows ? (
            <>
              <Button variant="ghost" onClick={() => setRows(null)}>Paste something else</Button>
              <Button
                disabled={!chosen.length || save.isPending || (needsAgent && !agentId)}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : `Save ${chosen.length} client${chosen.length === 1 ? "" : "s"}`}
              </Button>
            </>
          ) : (
            <Button disabled={run.isPending || text.trim().length < 5} onClick={() => run.mutate()}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {run.isPending ? "Reading…" : "Read with AI"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
