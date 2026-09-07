import { supabase } from "@/integrations/supabase/client";

export type DailyFtdTarget = {
  companyId: string;
  /** The day the lead was received (YYYY-MM-DD). */
  entryDate: string;
  sourceId: string | null;
  sourceLabel: string | null;
  reported: boolean;
  /** +1 when converting to an FTD, -1 when reversing it. */
  delta: 1 | -1;
};

/**
 * Keep Daily numbers in step with an FTD: the activation is counted on the day
 * the lead came in, against its own affiliate / source row.
 */
export async function applyFtdToDaily(t: DailyFtdTarget) {
  const label = (t.sourceLabel ?? "").trim().toLowerCase();
  const { data, error } = await supabase
    .from("daily_lead_entries")
    .select("id,activated,converted,reported,source_id,source")
    .eq("company_id", t.companyId)
    .eq("entry_date", t.entryDate);
  if (error) throw error;
  const rows = (data ?? []) as {
    id: string; activated: number | null; converted: number | null;
    reported: number | null; source_id: string | null; source: string | null;
  }[];
  const entry =
    (t.sourceId ? rows.find((r) => r.source_id === t.sourceId) : undefined)
    ?? (label ? rows.find((r) => !r.source_id && (r.source ?? "").trim().toLowerCase() === label) : undefined)
    ?? null;

  const bump = (n: number | null | undefined) => Math.max(0, (Number(n) || 0) + t.delta);

  if (entry) {
    const { error: upErr } = await supabase
      .from("daily_lead_entries")
      .update({
        activated: bump(entry.activated),
        converted: bump(entry.converted),
        ...(t.reported ? { reported: bump(entry.reported) } : {}),
      })
      .eq("id", entry.id);
    if (upErr) throw upErr;
    return;
  }
  if (t.delta < 0) return;
  const { error: insErr } = await supabase.from("daily_lead_entries").insert({
    company_id: t.companyId,
    entry_date: t.entryDate,
    source_id: t.sourceId,
    source: t.sourceId ? null : (t.sourceLabel ?? null),
    received: 1,
    activated: 1,
    converted: 1,
    reported: t.reported ? 1 : 0,
  } as never);
  if (insErr) throw insErr;
}
