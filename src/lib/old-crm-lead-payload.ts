import type { LeadStatus } from "@/lib/lead-status";

export type Directory = { id: string; name: string }[];

const clean = (v?: string | null) => {
  const s = (v ?? "").trim();
  return s === "" || s === "-" ? null : s;
};

const titleCase = (v?: string | null) =>
  (v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\p{L}][\p{L}'’-]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/** Map an old-CRM call status to the lead pipeline status. */
export const OLD_CRM_LEAD_STATUS: Record<string, LeadStatus> = {
  "new": "new",
  "no answer": "no_answer",
  "voice mail": "voice_mail",
  "voicemail": "voice_mail",
  "call back": "call_back",
  "callback": "call_back",
  "wrong number": "wrong_number",
  "not interested": "not_interested",
  "interested": "interested",
  "hot": "hot",
  "ftd": "activated",
  "deposited": "activated",
  "duplicate": "duplicate",
  "failed deposit": "failed_deposit",
  "low potential": "low_potential",
  "na1": "na1",
  "na2": "na2",
  "need to cancel": "need_to_cancel",
  "never registered": "never_registered",
  "no language": "no_language",
  "no money": "no_money",
  "not reachable": "not_reachable",
  "reassign": "reassign",
  "risk": "risk",
  "test": "test",
  "transfer": "transfer",
  "under age": "under_age",
  "wrong details": "wrong_details",
  "wrong person": "wrong_person",
};

function matchEmployee(raw: string | undefined, list: Directory) {
  const name = (raw ?? "").replace(/\(.*?\)/g, "").trim().toLowerCase();
  if (!name) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  const exact = list.find((e) => norm(e.name) === name);
  if (exact) return exact.id;
  const partial = list.find((e) => name.startsWith(norm(e.name)) || norm(e.name).startsWith(name));
  if (partial) return partial.id;
  const first = name.split(/\s+/)[0];
  const byFirst = list.filter((e) => norm(e.name).split(/\s+/)[0] === first);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

function matchDirectory(raw: string | undefined | null, list: Directory) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = norm(raw ?? "");
  if (!name) return null;
  const exact = list.find((item) => norm(item.name) === name);
  if (exact) return exact.id;
  const partial = list.filter((item) => {
    const candidate = norm(item.name);
    return candidate.length >= 4 && (name.startsWith(candidate) || candidate.startsWith(name));
  });
  return partial.length === 1 ? partial[0].id : null;
}

const isoOr = (v: string | null, fallback: string) => {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
};

/**
 * Turn raw old-CRM export rows into the payload accepted by
 * `import_old_crm_leads`, so individual lead records get created.
 */
export function buildOldCrmLeadPayload(
  rows: Record<string, string>[],
  dirs: { employees: Directory; affiliates: Directory; sources: Directory },
) {
  return rows.flatMap((r) => {
    const name = titleCase(clean(r.full_name));
    if (!name) return [];
    const old = (clean(r.status) ?? "").toLowerCase();
    const status = OLD_CRM_LEAD_STATUS[old] ?? "new";
    const ftd = Number(clean(r.ftd_total)) || 0;
    const assignedId = matchEmployee(r.assigned_to, dirs.employees);
    const retentionId = matchEmployee(r.ftd_owner, dirs.employees) ?? assignedId;
    const createdAt = isoOr(clean(r.created_date), new Date().toISOString());
    const ftdAt = isoOr(clean(r.ftd_time), createdAt);
    const notes = [
      clean(r.ext_id) ? `Old CRM ID ${clean(r.ext_id)}` : null,
      clean(r.country) || clean(r.city) ? [clean(r.city), clean(r.country)].filter(Boolean).join(", ") : null,
      clean(r.age) ? `Age ${clean(r.age)}` : null,
      clean(r.funnel) ? `Funnel ${clean(r.funnel)}` : null,
      clean(r.affiliate_data) ? `Affiliate data ${clean(r.affiliate_data)}` : null,
      clean(r.status) ? `Old status ${clean(r.status)}` : null,
      ftd > 0 ? `FTD ${ftd}` : null,
      clean(r.ftd_owner) ? `FTD owner ${clean(r.ftd_owner)}` : null,
      clean(r.email2) ? `Second email ${clean(r.email2)}` : null,
      clean(r.tag) ? `Tag ${clean(r.tag)}` : null,
    ].filter(Boolean);
    return [{
      name,
      email: clean(r.email),
      phone: clean(r.phone),
      old_crm_id: clean(r.ext_id),
      conversion_employee_id: assignedId,
      retention_employee_id: retentionId,
      source_id: matchDirectory(clean(r.source), dirs.sources),
      affiliate_id: matchDirectory(clean(r.affiliate_name) ?? clean(r.source), dirs.affiliates),
      status,
      created_at: createdAt,
      // Only count the deposit when we know who owns it; otherwise the import rejects the row.
      ftd_amount: retentionId ? ftd : 0,
      ftd_at: ftdAt,
      country: clean(r.country),
      city: clean(r.city),
      age: Number(clean(r.age)) || null,
      notes: notes.join(" · ") || null,
    }];
  });
}
