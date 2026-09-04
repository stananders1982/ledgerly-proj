import { fetchAll } from "@/lib/fetch-all";
import { supabase } from "@/integrations/supabase/client";
import type { ImportField } from "@/components/csv-import";

/** Raw old-CRM export columns — the Lead entries importer uses these verbatim. */
export const OLD_CRM_ENTRY_FIELDS: ImportField[] = [
  { key: "ext_id", label: "ID" },
  { key: "full_name", label: "Full Name" },
  { key: "full_name_2", label: "Full Name 2" },
  { key: "email", label: "E-mail" },
  { key: "email2", label: "E-mail2" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "age", label: "Age" },
  { key: "created_date", label: "Created Date", required: true, hint: "Any format — the day the lead came in" },
  { key: "source", label: "Source", hint: "Matched to a lead source or affiliate by name" },
  { key: "funnel", label: "Funnel Name", hint: "Used as the campaign when the whole day shares one" },
  { key: "affiliate_data", label: "Affiliate Data" },
  { key: "affiliate_name", label: "Affiliate Name", hint: "Preferred over Source when both are present" },
  { key: "assigned_to", label: "Assigned to" },
  { key: "status", label: "Status", hint: "Invalid statuses are counted as invalid leads" },
  { key: "ftd_total", label: "FTD Total", hint: "Above 0 counts as an activated lead" },
  { key: "lifetime_deposit", label: "Lifetime Deposit" },
  { key: "ftd_time", label: "FTD Time" },
  { key: "ftd_owner", label: "FTD Owner" },
  { key: "tag", label: "Tag" },
  { key: "timezone", label: "timezone" },
  { key: "online", label: "Online" },
  { key: "brand", label: "Brand" },
  { key: "balance", label: "Balance" },
  { key: "calls_count", label: "Calls Count" },
  { key: "last_comment", label: "Last comment text" },
];

/** Statuses that mark a lead as invalid in the Daily numbers. */
export const INVALID_OLD_CRM_STATUSES = new Set([
  "need to cancel", "wrong number", "never registered", "wrong person",
  "no language", "under age", "underage", "wrong details",
]);

const clean = (v?: string | null) => {
  const s = (v ?? "").trim();
  return s === "" || s === "-" ? null : s;
};

const normalizeDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
};

export type DailyGroup = {
  key: string;
  entry_date: string;
  source_id: string | null;
  source_label: string;
  campaign: string | null;
  received: number;
  invalid: number;
  activated: number;
};

/** Roll the raw old-CRM export up into one Daily numbers row per date + affiliate. */
export function groupOldCrmEntries(
  rows: Record<string, string>[],
  resolveSourceId: (label: string) => string | null,
): DailyGroup[] {
  const groups = new Map<string, DailyGroup & { funnels: Set<string> }>();
  for (const r of rows) {
    const entry_date = normalizeDate(clean(r.created_date) ?? "");
    const label = clean(r.affiliate_name) ?? clean(r.source) ?? "";
    const source_id = label ? resolveSourceId(label) : null;
    const key = `${entry_date}|${source_id ?? label.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key, entry_date, source_id, source_label: label || "—",
        campaign: null, received: 0, invalid: 0, activated: 0, funnels: new Set<string>(),
      };
      groups.set(key, g);
    }
    const status = (clean(r.status) ?? "").toLowerCase();
    const ftd = Number(clean(r.ftd_total)) || 0;
    g.received += 1;
    if (INVALID_OLD_CRM_STATUSES.has(status)) g.invalid += 1;
    if (ftd > 0 || status === "ftd" || status === "deposited") g.activated += 1;
    const funnel = clean(r.funnel);
    if (funnel) g.funnels.add(funnel);
  }
  return [...groups.values()]
    .map(({ funnels, ...g }) => ({ ...g, campaign: funnels.size === 1 ? [...funnels][0] : null }))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.source_label.localeCompare(b.source_label));
}

export type ExistingDaily = { id: string; received: number; invalid: number; activated: number; converted: number };

/** Existing Daily numbers rows for the dates touched by an import. */
export async function existingDailyRows(groups: DailyGroup[]) {
  const map = new Map<string, ExistingDaily>();
  const dates = [...new Set(groups.map((g) => g.entry_date))];
  if (dates.length === 0) return map;
  const { data, error } = await supabase
    .from("daily_lead_entries")
    .select("id,entry_date,source_id,source,received,invalid,activated,converted")
    .in("entry_date", dates);
  if (error) throw error;
  for (const row of data ?? []) {
    const key = `${row.entry_date}|${row.source_id ?? String(row.source ?? "").toLowerCase()}`;
    map.set(key, {
      id: row.id,
      received: row.received ?? 0,
      invalid: row.invalid ?? 0,
      activated: row.activated ?? 0,
      converted: row.converted ?? 0,
    });
  }
  return map;
}

/** Write the grouped totals: increment existing rows, insert new ones. */
export async function writeDailyGroups(groups: DailyGroup[]) {
  const existing = await existingDailyRows(groups);
  const inserts: Record<string, unknown>[] = [];
  let updated = 0;
  for (const g of groups) {
    const prev = existing.get(g.key);
    if (prev) {
      const { error } = await supabase
        .from("daily_lead_entries")
        .update({
          received: prev.received + g.received,
          invalid: prev.invalid + g.invalid,
          activated: prev.activated + g.activated,
          converted: prev.converted + g.activated,
        })
        .eq("id", prev.id);
      if (error) throw error;
      updated += 1;
      continue;
    }
    inserts.push({
      entry_date: g.entry_date,
      source_id: g.source_id,
      source: g.source_id ? null : g.source_label,
      campaign: g.campaign,
      received: g.received,
      invalid: g.invalid,
      activated: g.activated,
      converted: g.activated,
      reported: 0,
      cost: 0,
      notes: "Imported from old CRM export",
    });
  }
  if (inserts.length) {
    const { error } = await supabase.from("daily_lead_entries").insert(inserts as never);
    if (error) throw error;
  }
  return { created: inserts.length, updated, existing };
}

const digits = (v?: string | null) => {
  const d = (v ?? "").replace(/[^0-9]+/g, "");
  return d.length >= 7 ? d : null;
};

/**
 * Drop rows that already exist as leads, so re-uploading the same export
 * during a shift neither duplicates leads nor doubles the daily totals.
 */
export async function filterNewOldCrmRows(rows: Record<string, string>[]) {
  const existing = await fetchAll(() =>
    supabase.from("leads").select("old_crm_id,email,phone"),
  );
  const ids = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const l of existing ?? []) {
    const id = clean((l as any).old_crm_id);
    if (id) ids.add(id.toLowerCase());
    const em = clean((l as any).email);
    if (em) emails.add(em.toLowerCase());
    const ph = digits((l as any).phone);
    if (ph) phones.add(ph);
  }
  const fresh: Record<string, string>[] = [];
  let skipped = 0;
  for (const r of rows) {
    const id = clean(r.ext_id)?.toLowerCase() ?? null;
    const em = clean(r.email)?.toLowerCase() ?? null;
    const ph = digits(r.phone);
    const known = (id && ids.has(id)) || (em && emails.has(em)) || (ph && phones.has(ph));
    if (known) { skipped += 1; continue; }
    if (id) ids.add(id);
    if (em) emails.add(em);
    if (ph) phones.add(ph);
    fresh.push(r);
  }
  return { rows: fresh, skipped };
}
