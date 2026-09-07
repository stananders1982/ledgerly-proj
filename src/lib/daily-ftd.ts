import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/format";

export type DailyRowTarget = {
  companyId: string;
  /** The day the lead was received (YYYY-MM-DD). */
  entryDate: string;
  sourceId: string | null;
  sourceLabel: string | null;
};

type EntryRow = {
  id: string;
  activated: number | null;
  converted: number | null;
  reported: number | null;
  source_id: string | null;
  source: string | null;
};

/** The Daily numbers row for a day + partner, or null when there isn't one. */
async function findDailyRow(t: DailyRowTarget): Promise<EntryRow | null> {
  const label = (t.sourceLabel ?? "").trim().toLowerCase();
  const { data, error } = await supabase
    .from("daily_lead_entries")
    .select("id,activated,converted,reported,source_id,source")
    .eq("company_id", t.companyId)
    .eq("entry_date", t.entryDate);
  if (error) throw error;
  const rows = (data ?? []) as EntryRow[];
  return (
    (t.sourceId ? rows.find((r) => r.source_id === t.sourceId) : undefined)
    ?? (label ? rows.find((r) => !r.source_id && (r.source ?? "").trim().toLowerCase() === label) : undefined)
    ?? null
  );
}

/** FTDs already counted on a row that nobody is attached to yet. */
async function freeSlots(entry: EntryRow) {
  const { data, error } = await supabase
    .from("daily_lead_activations")
    .select("activated_count")
    .eq("entry_id", entry.id);
  if (error) throw error;
  const allocated = (data ?? []).reduce((s, a: any) => s + (Number(a.activated_count) || 0), 0);
  return Math.max(0, (Number(entry.activated) || 0) - allocated);
}

export type ConvertLeadInput = {
  companyId: string;
  lead: {
    id: string;
    crm_id?: string | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    employee_id?: string | null;
    source_id?: string | null;
    created_at?: string | null;
    sourceLabel?: string | null;
  };
  retentionEmployeeId: string;
  reported: boolean;
  balance: number;
};

/**
 * Turn a lead into an FTD client and keep Daily numbers honest:
 * the client is attached to the day the lead came in, filling an FTD that was
 * already counted there before adding a new one.
 */
export async function convertLeadToFtd(input: ConvertLeadInput) {
  const { companyId, lead } = input;
  const target: DailyRowTarget = {
    companyId,
    entryDate: String(lead.created_at ?? "").slice(0, 10) || todayISO(),
    sourceId: lead.source_id ?? null,
    sourceLabel: lead.sourceLabel ?? null,
  };

  let entry = await findDailyRow(target);
  let consumesSlot = false;
  if (entry) {
    consumesSlot = (await freeSlots(entry)) > 0;
  } else {
    const { data, error } = await supabase
      .from("daily_lead_entries")
      .insert({
        company_id: companyId,
        entry_date: target.entryDate,
        source_id: target.sourceId,
        source: target.sourceId ? null : target.sourceLabel,
        received: 1,
        activated: 0,
        converted: 0,
        reported: 0,
      } as never)
      .select("id,activated,converted,reported,source_id,source")
      .single();
    if (error) throw error;
    entry = data as EntryRow;
  }

  const { data: activation, error: actErr } = await supabase
    .from("daily_lead_activations")
    .insert({
      entry_id: entry.id,
      crm_id: lead.crm_id,
      lead_name: lead.name,
      phone: lead.phone,
      email: lead.email,
      employee_id: input.retentionEmployeeId,
      conversion_employee_id: lead.employee_id ?? null,
      activated_count: 1,
      activation_date: todayISO(),
      balance: input.balance,
      potential: null,
      answered: false,
      legacy: false,
    } as never)
    .select("id")
    .single();
  if (actErr) throw actErr;

  const patch: Record<string, number> = {};
  if (!consumesSlot) {
    patch.activated = (Number(entry.activated) || 0) + 1;
    patch.converted = (Number(entry.converted) || 0) + 1;
  }
  if (input.reported) patch.reported = (Number(entry.reported) || 0) + 1;
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("daily_lead_entries").update(patch).eq("id", entry.id);
    if (error) throw error;
  }

  const { error: leadErr } = await supabase
    .from("leads")
    .update({ activated: true, reported: input.reported, status: "activated", activation_id: activation.id })
    .eq("id", lead.id);
  if (leadErr) throw leadErr;

  return activation.id as string;
}

/**
 * Reverse an FTD: take the client's day back down by one so the Daily numbers
 * never keep counting a deposit that was removed.
 */
export async function reverseFtdOnDaily(activationId: string) {
  const { data: act, error } = await supabase
    .from("daily_lead_activations")
    .select("id,entry_id,activated_count")
    .eq("id", activationId)
    .maybeSingle();
  if (error) throw error;
  const entryId = (act as any)?.entry_id as string | null | undefined;
  if (!entryId) return;

  const { data: leadRows, error: leadErr } = await supabase
    .from("leads")
    .select("reported")
    .eq("activation_id", activationId);
  if (leadErr) throw leadErr;
  const wasReported = (leadRows ?? []).some((l: any) => l.reported === true);

  const { data: entry, error: entryErr } = await supabase
    .from("daily_lead_entries")
    .select("id,activated,converted,reported")
    .eq("id", entryId)
    .maybeSingle();
  if (entryErr) throw entryErr;
  if (!entry) return;

  const count = Math.max(1, Number((act as any)?.activated_count) || 1);
  const down = (n: number | null) => Math.max(0, (Number(n) || 0) - count);
  const { error: upErr } = await supabase
    .from("daily_lead_entries")
    .update({
      activated: down((entry as any).activated),
      converted: down((entry as any).converted),
      ...(wasReported ? { reported: Math.max(0, (Number((entry as any).reported) || 0) - 1) } : {}),
    })
    .eq("id", entryId);
  if (upErr) throw upErr;
}
