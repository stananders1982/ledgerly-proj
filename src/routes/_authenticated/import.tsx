import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Info, History as HistoryIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CsvImportDialog, type ImportField, type ImportMeta, type PreviewResult } from "@/components/csv-import";
import { fetchAll } from "@/lib/fetch-all";
import { AiClientPasteBulk } from "@/components/ai-client-paste";
import type { LeadStatus } from "@/lib/lead-status";
import { useAuth } from "@/lib/auth-context";
import { EmptyState } from "@/components/empty-state";

/** Counts recorded in the import history for one upload. */
export type ImportRunStats = {
  created?: number;
  updated?: number;
  skipped?: number;
  invalid?: number;
  ftds?: number;
  extra?: Record<string, number>;
};

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Bulk Import — Ledgerly" }] }),
  component: ImportPage,
});

type ImportDef = {
  key: string;
  title: string;
  description: string;
  templateName: string;
  fields: ImportField[];
  sampleRows: Record<string, string>[];
  onImport: (rows: Record<string, string>[], meta: ImportMeta) => Promise<ImportRunStats | void>;
  onPreview?: (rows: Record<string, string>[]) => Promise<PreviewResult>;
};

function useDirectory(key: string) {
  return useQuery({
    queryKey: ["import-directory", key],
    queryFn: async () => {
      if (key === "employees") {
        const { data, error } = await supabase.rpc("list_employees_directory");
        if (error) throw error;
        return (data ?? []) as { id: string; name: string; active: boolean; team?: string | null }[];
      }
      if (key === "affiliates") {
        const { data, error } = await supabase.rpc("list_affiliates_directory");
        if (error) throw error;
        return (data ?? []) as { id: string; name: string; active: boolean }[];
      }
      if (key === "sources") {
        return await fetchAll(() => supabase.from("lead_sources").select("id,name,pricing_model,price").eq("active", true).order("name")) ?? [];
      }
      if (key === "categories") {
        return await fetchAll(() => supabase.from("expense_categories").select("id,name").eq("active", true).order("name")) ?? [];
      }
      if (key === "leads") {
        return await fetchAll(() => supabase.from("leads").select("id,name").order("name")) ?? [];
      }
      return [];
    },
    staleTime: 60_000,
  });
}

function normalizeDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${v}`);
  return d.toISOString().slice(0, 10);
}

/** People's names are stored capitalized: "richard thompson" -> "Richard Thompson". */
function titleCase(v: string | undefined | null) {
  return (v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\p{L}][\p{L}'’-]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Old-CRM exports use "-" for empty cells. */
function clean(v: string | undefined) {
  const s = (v ?? "").trim();
  return s === "" || s === "-" ? null : s;
}

/** Map an old-CRM call status to the lead pipeline status. */
const OLD_CRM_LEAD_STATUS: Record<string, LeadStatus> = {
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

/**
 * Names in the old CRM carry suffixes ("Jack Alberts (Conv)") or are shortened
 * here ("Jonathan F"). Match exactly first, then by prefix / first name.
 */
function matchEmployee(raw: string | undefined, list: { id: string; name: string }[]) {
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

/** Match old-CRM partner labels such as "AmazeSec" to "Amaze" safely. */
function matchDirectory(raw: string | undefined | null, list: { id: string; name: string }[]) {
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

function useImportDefinitions() {
  const qc = useQueryClient();
  const employeesQ = useDirectory("employees");
  const affiliatesQ = useDirectory("affiliates");
  const sourcesQ = useDirectory("sources");
  const categoriesQ = useDirectory("categories");
  const leadsQ = useDirectory("leads");

  const byName = (list: { id: string; name: string }[] | undefined) => {
    return new Map((list ?? []).map((x) => [String(x.name).trim().toLowerCase(), x.id]));
  };

  const employeeByName = byName(employeesQ.data);
  const affiliateByName = byName(affiliatesQ.data);
  const sourceByName = byName(sourcesQ.data);
  const categoryByName = byName(categoriesQ.data);
  const leadByName = byName(leadsQ.data);

  const defs: ImportDef[] = useMemo(() => {
    const invalidate = (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    const buildOldCrmPayload = (rows: Record<string, string>[]) => {
      const employees = employeesQ.data ?? [];
      return rows.map((r) => {
        const old = (clean(r.status) ?? "").toLowerCase();
        const mapped = OLD_CRM_LEAD_STATUS[old] ?? "new";
        const ftd = Number(clean(r.ftd_total)) || 0;
        const sourceName = (clean(r.source) ?? "").toLowerCase();
        const affName = (clean(r.affiliate_name) ?? clean(r.source) ?? "").toLowerCase();
        const assignedId = matchEmployee(r.assigned_to, employees);
        const retentionId = matchEmployee(r.ftd_owner, employees) ?? assignedId;
        const createdAt = new Date(clean(r.created_date) ?? Date.now()).toISOString();
        const ftdAt = clean(r.ftd_time) ? new Date(clean(r.ftd_time) as string).toISOString() : createdAt;
        const noteBits = [
          clean(r.ext_id) ? `Old CRM ID ${clean(r.ext_id)}` : null,
          clean(r.country) || clean(r.city) ? [clean(r.city), clean(r.country)].filter(Boolean).join(", ") : null,
          clean(r.age) ? `Age ${clean(r.age)}` : null,
          clean(r.funnel) ? `Funnel ${clean(r.funnel)}` : null,
          clean(r.affiliate_data) ? `Affiliate data ${clean(r.affiliate_data)}` : null,
          clean(r.status) ? `Old status ${clean(r.status)}` : null,
          ftd > 0 ? `FTD ${ftd}${clean(r.ftd_time) ? ` on ${clean(r.ftd_time)}` : ""}` : null,
          clean(r.ftd_owner) ? `FTD owner ${clean(r.ftd_owner)}` : null,
          clean(r.full_name_2) ? `Also known as ${clean(r.full_name_2)}` : null,
          clean(r.email2) ? `Second email ${clean(r.email2)}` : null,
          clean(r.tag) ? `Tag ${clean(r.tag)}` : null,
        ].filter(Boolean);
        return {
          name: titleCase(r.full_name),
          email: clean(r.email),
          phone: clean(r.phone),
          old_crm_id: clean(r.ext_id),
          conversion_employee_id: assignedId,
          retention_employee_id: retentionId,
          source_id: sourceByName.get(sourceName) ?? matchDirectory(r.source, sourcesQ.data ?? []),
          affiliate_id: affiliateByName.get(affName) ?? matchDirectory(clean(r.affiliate_name) ?? r.source, affiliatesQ.data ?? []),
          status: mapped,
          created_at: createdAt,
          ftd_amount: ftd,
          ftd_at: ftdAt,
          country: clean(r.country),
          city: clean(r.city),
          age: Number(clean(r.age)) || null,
          notes: noteBits.join(" · ") || null,
          fingerprint_source: JSON.stringify(r),
        };
      });
    };

    return [
      {
        key: "old-crm-leads",
        title: "Leads (old CRM export)",
        description:
          "Drop in the raw export from your previous CRM — same columns, no editing. FTD rows automatically create and connect the client, first income payment and Daily numbers allocation without double-counting existing totals.",
        templateName: "old-crm-export-template.csv",
        fields: [
          { key: "ext_id", label: "ID", hint: "Old CRM record id — kept in the notes" },
          { key: "full_name", label: "Full Name", required: true },
          { key: "full_name_2", label: "Full Name 2" },
          { key: "email", label: "E-mail" },
          { key: "email2", label: "E-mail2" },
          { key: "phone", label: "Phone" },
          { key: "country", label: "Country" },
          { key: "city", label: "City" },
          { key: "age", label: "Age", hint: "Number or “-” if unknown" },
          { key: "created_date", label: "Created Date", hint: "Any format, e.g. 2026-09-03 09:10:07" },
          { key: "source", label: "Source", hint: "Matched to a lead source or affiliate by name" },
          { key: "funnel", label: "Funnel Name" },
          { key: "affiliate_data", label: "Affiliate Data" },
          { key: "affiliate_name", label: "Affiliate Name" },
          { key: "assigned_to", label: "Assigned to", hint: "Conversion agent — “(Conv)” suffixes are ignored" },
          { key: "status", label: "Status", hint: "No Answer, Wrong Number, Not Interested, Call Back, Voice Mail, FTD…" },
          { key: "ftd_total", label: "FTD Total", hint: "First deposit amount" },
          { key: "lifetime_deposit", label: "Lifetime Deposit" },
          { key: "ftd_time", label: "FTD Time" },
          { key: "ftd_owner", label: "FTD Owner" },
          { key: "tag", label: "Tag" },
        ],
        sampleRows: [
          {
            ext_id: "2010526", full_name: "Arthur Raymond Spencer", full_name_2: "", email: "rays1938@yahoo.com", email2: "",
            phone: "+61497508799", country: "Australia", city: "", age: "-", created_date: "2026-09-03 09:10:07",
            source: "AmazeSec", funnel: "BrynVex-bobr_Dmitriy-BrunViks", affiliate_data: "", affiliate_name: "", assigned_to: "Dave Miller",
            status: "No Answer", ftd_total: "0", lifetime_deposit: "0", ftd_time: "-", ftd_owner: "", tag: "",
          },
          {
            ext_id: "2010511", full_name: "Steven Gill", full_name_2: "", email: "lynnesteven@gmail.com", email2: "",
            phone: "+61427533557", country: "Australia", city: "", age: "-", created_date: "2026-09-03 05:08:31",
            source: "AmazeSec", funnel: "BrynVex-bobr_Dmitriy-BrunViks", affiliate_data: "", affiliate_name: "", assigned_to: "Jonathan Friedman",
            status: "Call Back", ftd_total: "250", lifetime_deposit: "250", ftd_time: "2026-09-03 05:48:44", ftd_owner: "", tag: "",
          },
        ],
        onPreview: async (rows) => {
          const { data, error } = await supabase.rpc("preview_old_crm_leads", { _rows: buildOldCrmPayload(rows) });
          if (error) throw error;
          return data as unknown as PreviewResult;
        },
        onImport: async (rows) => {
          const payload = buildOldCrmPayload(rows);

          const { data, error } = await supabase.rpc("import_old_crm_leads", { _rows: payload });
          if (error) throw error;
          const result = data as {
            imported?: number;
            updated?: number;
            ftds_connected?: number;
            invalid_connected?: number;
            daily_rows_created?: number;
            daily_rows_updated?: number;
            skipped?: number;
          } | null;

          invalidate([
            "individual-leads", "leads", "clients", "activated-leads", "revenue",
            "daily-leads-v2", "daily-lead-activations", "entries-for-sources",
            "dash-leads-v2", "unallocated-ftds",
          ]);
          const imported = Number(result?.imported ?? 0);
          const updated = Number(result?.updated ?? 0);
          const connected = Number(result?.ftds_connected ?? 0);
          const invalid = Number(result?.invalid_connected ?? 0);
          const skipped = Number(result?.skipped ?? 0);
          if (imported) toast.success(`Imported ${imported} leads · ${invalid} invalid · connected ${connected} FTD${connected === 1 ? "" : "s"}`);
          if (updated) toast.info(`Filled missing details on ${updated} existing record${updated === 1 ? "" : "s"}`);
          if (skipped) toast.info(`Skipped ${skipped} already in the system`);
          if (!imported && !skipped && !updated) toast.info("Nothing to import");
          return {
            created: imported,
            updated,
            skipped,
            invalid,
            ftds: connected,
            extra: {
              daily_rows_created: Number(result?.daily_rows_created ?? 0),
              daily_rows_updated: Number(result?.daily_rows_updated ?? 0),
            },
          };
        },
      },
      {
        key: "lead-entries",
        title: "Lead entries",
        description: "Daily lead totals per source. Use source/affiliate name; the app will match it automatically.",
        templateName: "lead-entries-template.csv",
        fields: [
          { key: "entry_date", label: "Date", required: true, hint: "YYYY-MM-DD" },
          { key: "source", label: "Affiliate", hint: "Must match an existing source/affiliate name" },
          { key: "campaign", label: "Campaign" },
          { key: "received", label: "Received", required: true },
          { key: "activated", label: "Activated" },
          { key: "reported", label: "Reported" },
          { key: "notes", label: "Notes" },
        ],
        sampleRows: [
          { entry_date: "2026-07-01", source: "Facebook", campaign: "Summer", received: "120", activated: "12", reported: "10", notes: "" },
          { entry_date: "2026-07-01", source: "Google", campaign: "Search", received: "80", activated: "8", reported: "8", notes: "" },
        ],
        onImport: async (rows) => {
          const payload = rows.map((r) => {
            const activated = Number(r.activated) || 0;
            return {
              entry_date: normalizeDate(r.entry_date),
              source_id: sourceByName.get((r.source ?? "").trim().toLowerCase()) ?? null,
              campaign: r.campaign || null,
              received: Number(r.received) || 0,
              activated,
              converted: activated,
              reported: Number(r.reported) || 0,
              cost: 0,
              notes: r.notes || null,
            };
          });
          const { error } = await supabase.from("daily_lead_entries").insert(payload);
          if (error) throw error;
          invalidate(["daily-leads-v2", "entries-for-sources", "dash-leads-v2"]);
          toast.success(`Imported ${payload.length} lead entries`);
        },
      },
      {
        key: "revenue",
        title: "Income / Revenue",
        description: "Client deposits. Use employee, affiliate and lead names; the app resolves them to IDs.",
        templateName: "revenue-template.csv",
        fields: [
          { key: "date", label: "Date", required: true, hint: "YYYY-MM-DD" },
          { key: "customer_name", label: "Customer Name", required: true },
          { key: "amount", label: "Amount", required: true },
          { key: "method", label: "Method", hint: "Card, Wire, or Crypto" },
          { key: "method_provider", label: "Method Provider", hint: "e.g. Stripe, Wise, Coinbase" },
          { key: "employee", label: "Employee", hint: "Must match an existing employee name" },
          { key: "lead_name", label: "Lead Name", hint: "Must match an existing lead name" },
          { key: "affiliate", label: "Affiliate", hint: "Must match an existing affiliate name" },
          { key: "notes", label: "Notes" },
        ],
        sampleRows: [
          { date: "2026-07-15", customer_name: "Acme Corp", amount: "5000", method: "Wire", method_provider: "Wise", employee: "John Doe", lead_name: "", affiliate: "", notes: "Initial deposit" },
          { date: "2026-07-16", customer_name: "Jane Smith", amount: "2500", method: "Card", method_provider: "Stripe", employee: "Jane Roe", lead_name: "Jane Smith", affiliate: "Facebook", notes: "" },
        ],
        onImport: async (rows) => {
          const payload = rows.map((r) => ({
            date: normalizeDate(r.date),
            customer_name: titleCase(r.customer_name),
            amount: Number(r.amount) || 0,
            method: r.method || null,
            method_provider: r.method_provider || null,
            employee_id: employeeByName.get((r.employee ?? "").trim().toLowerCase()) ?? null,
            lead_id: leadByName.get((r.lead_name ?? "").trim().toLowerCase()) ?? null,
            affiliate_id: affiliateByName.get((r.affiliate ?? "").trim().toLowerCase()) ?? null,
            notes: r.notes || null,
          }));
          const { error } = await supabase.from("revenue").insert(payload);
          if (error) throw error;
          invalidate(["revenue", "revenue-names-for-leads", "dash-revenue"]);
          toast.success(`Imported ${payload.length} revenue rows`);
        },
      },
      {
        key: "expenses",
        title: "Expenses",
        description: "Outgoing payments. Category and optional affiliate are matched by name.",
        templateName: "expenses-template.csv",
        fields: [
          { key: "date", label: "Date", required: true, hint: "YYYY-MM-DD" },
          { key: "amount", label: "Amount", required: true },
          { key: "category", label: "Category", required: true, hint: "Must match an existing expense category" },
          { key: "affiliate", label: "Affiliate", hint: "Optional — must match an existing affiliate" },
          { key: "notes", label: "Notes" },
        ],
        sampleRows: [
          { date: "2026-07-01", amount: "500", category: "Rent", affiliate: "", notes: "Office rent" },
          { date: "2026-07-05", amount: "1200", category: "Marketing", affiliate: "Facebook", notes: "Ad spend" },
        ],
        onImport: async (rows) => {
          const payload = rows.map((r) => ({
            date: normalizeDate(r.date),
            amount: Number(r.amount) || 0,
            category_id: categoryByName.get((r.category ?? "").trim().toLowerCase()) ?? null,
            affiliate_id: affiliateByName.get((r.affiliate ?? "").trim().toLowerCase()) ?? null,
            notes: r.notes || null,
          }));
          const { error } = await supabase.from("expenses").insert(payload);
          if (error) throw error;
          invalidate(["expenses-list", "expenses"]);
          toast.success(`Imported ${payload.length} expenses`);
        },
      },
      {
        key: "employees",
        title: "Employees",
        description: "Bulk-create employees. Team must be C (Conversion), R (Retention), or M (Manager).",
        templateName: "employees-template.csv",
        fields: [
          { key: "name", label: "Name", required: true },
          { key: "email", label: "Email" },
          { key: "role", label: "Role" },
          { key: "salary", label: "Salary" },
          { key: "commission_pct", label: "Commission %", hint: "e.g. 10 for 10%" },
          { key: "ftd_commission", label: "FTD Commission", hint: "Flat amount per FTD" },
          { key: "team", label: "Team", hint: "C, R, or M" },
          { key: "active", label: "Active", hint: "true or false" },
          { key: "target_ftds", label: "Target FTDs" },
          { key: "target_stds", label: "Target STDs" },
          { key: "target_revenue", label: "Target Revenue" },
        ],
        sampleRows: [
          { name: "John Doe", email: "john@example.com", role: "Conversion", salary: "3000", commission_pct: "8", ftd_commission: "100", team: "C", active: "true", target_ftds: "20", target_stds: "10", target_revenue: "50000" },
          { name: "Jane Roe", email: "jane@example.com", role: "Retention", salary: "3500", commission_pct: "10", ftd_commission: "0", team: "R", active: "true", target_ftds: "", target_stds: "15", target_revenue: "40000" },
        ],
        onImport: async (rows) => {
          const payload = rows.map((r) => ({
            name: (r.name ?? "").trim(),
            email: r.email || null,
            role: r.role || null,
            salary: Number(r.salary) || 0,
            commission_pct: Number(r.commission_pct) || 0,
            ftd_commission: Number(r.ftd_commission) || 0,
            team: ["R", "C", "M"].includes((r.team ?? "").trim().toUpperCase()) ? (r.team ?? "").trim().toUpperCase() : "C",
            active: String(r.active).toLowerCase() !== "false",
            target_ftds: r.target_ftds ? Number(r.target_ftds) : null,
            target_stds: r.target_stds ? Number(r.target_stds) : null,
            target_revenue: r.target_revenue ? Number(r.target_revenue) : null,
          }));
          const { error } = await supabase.from("employees").insert(payload);
          if (error) throw error;
          invalidate(["employees-directory", "employees"]);
          toast.success(`Imported ${payload.length} employees`);
        },
      },
      {
        key: "lead-sources",
        title: "Lead Sources",
        description: "Create or update marketing sources with pricing model and conversion target.",
        templateName: "lead-sources-template.csv",
        fields: [
          { key: "name", label: "Name", required: true },
          { key: "pricing_model", label: "Pricing Model", required: true, hint: "CPL or CPA" },
          { key: "price", label: "Price", required: true },
          { key: "expected_conversion_rate", label: "Expected Conversion Rate", hint: "0.25 for 25%" },
          { key: "active", label: "Active", hint: "true or false" },
        ],
        sampleRows: [
          { name: "Facebook", pricing_model: "CPL", price: "5", expected_conversion_rate: "0.15", active: "true" },
          { name: "Referral", pricing_model: "CPA", price: "100", expected_conversion_rate: "0.30", active: "true" },
        ],
          onImport: async (rows) => {
          const payload = rows.map((r) => ({
            name: (r.name ?? "").trim(),
            pricing_model: (["CPL", "CPA"].includes((r.pricing_model ?? "").trim().toUpperCase()) ? (r.pricing_model ?? "").trim().toUpperCase() : "CPL") as "CPL" | "CPA",
            price: Number(r.price) || 0,
            expected_conversion_rate: r.expected_conversion_rate ? Number(r.expected_conversion_rate) : undefined,
            active: String(r.active).toLowerCase() !== "false",
          }));
          const { error } = await supabase.from("lead_sources").insert(payload);
          if (error) throw error;
          invalidate(["sources-min", "sources", "lead-sources"]);
          toast.success(`Imported ${payload.length} lead sources`);
        },
      },
      {
        key: "affiliates",
        title: "Affiliates",
        description: "Create affiliates separately from lead sources. Useful for non-source partners.",
        templateName: "affiliates-template.csv",
        fields: [
          { key: "name", label: "Name", required: true },
          { key: "active", label: "Active", hint: "true or false" },
          { key: "cpa_rate", label: "CPA Rate", hint: "Flat payout per conversion" },
        ],
        sampleRows: [
          { name: "Partner A", active: "true", cpa_rate: "50" },
          { name: "Partner B", active: "true", cpa_rate: "75" },
        ],
          onImport: async (rows) => {
          const payload = rows.map((r) => ({
            name: (r.name ?? "").trim(),
            active: String(r.active).toLowerCase() !== "false",
            cpa_rate: r.cpa_rate ? Number(r.cpa_rate) : undefined,
          }));
          const { error } = await supabase.from("affiliates").insert(payload);
          if (error) throw error;
          invalidate(["affiliates", "affiliates-directory"]);
          toast.success(`Imported ${payload.length} affiliates`);
        },
      },
      {
        key: "withdrawals",
        title: "Withdrawals",
        description: "Client withdrawals. Employee and affiliate are resolved by name.",
        templateName: "withdrawals-template.csv",
        fields: [
          { key: "date", label: "Date", required: true, hint: "YYYY-MM-DD" },
          { key: "customer_name", label: "Customer Name", required: true },
          { key: "amount", label: "Amount", required: true },
          { key: "employee", label: "Employee", hint: "Must match an existing employee name" },
          { key: "affiliate", label: "Affiliate", hint: "Optional" },
          { key: "notes", label: "Notes" },
        ],
        sampleRows: [
          { date: "2026-07-20", customer_name: "Acme Corp", amount: "1000", employee: "John Doe", affiliate: "", notes: "" },
        ],
        onImport: async (rows) => {
          const payload = rows.map((r) => ({
            date: normalizeDate(r.date),
            customer_name: titleCase(r.customer_name),
            amount: Number(r.amount) || 0,
            employee_id: employeeByName.get((r.employee ?? "").trim().toLowerCase()) ?? null,
            affiliate_id: affiliateByName.get((r.affiliate ?? "").trim().toLowerCase()) ?? null,
            notes: r.notes || null,
          }));
          const { error } = await supabase.from("withdrawals").insert(payload);
          if (error) throw error;
          invalidate(["withdrawals"]);
          toast.success(`Imported ${payload.length} withdrawals`);
        },
      },
    ];
  }, [qc, employeesQ.data, employeeByName, affiliateByName, sourceByName, categoryByName, leadByName]);

  return { defs, isLoading: employeesQ.isLoading || affiliatesQ.isLoading || sourcesQ.isLoading || categoriesQ.isLoading || leadsQ.isLoading };
}

function downloadTemplate(def: ImportDef) {
  const headers = def.fields.map((f) => f.label);
  const csv = [
    headers.join(","),
    ...def.sampleRows.map((row) => headers.map((h) => {
      const key = def.fields.find((f) => f.label === h)?.key ?? h;
      const v = row[key] ?? "";
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = def.templateName;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportCard({ def, loading }: { def: ImportDef; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const required = def.fields.filter((f) => f.required).map((f) => f.label);
  const { user, companyId } = useAuth();
  const qc = useQueryClient();

  /** Best-effort audit entry for one upload. Never blocks the import. */
  const recordRun = async (rowCount: number, meta: ImportMeta, stats: ImportRunStats) => {
    if (!companyId || !user) return;
    try {
      await supabase.from("import_runs").insert({
        company_id: companyId,
        user_id: user.id,
        user_email: user.email ?? null,
        import_key: def.key,
        file_name: meta.fileName ?? null,
        row_count: rowCount,
        created_count: stats.created ?? 0,
        updated_count: stats.updated ?? 0,
        skipped_count: stats.skipped ?? 0,
        invalid_count: stats.invalid ?? 0,
        ftd_count: stats.ftds ?? 0,
        stats: (stats.extra ?? null) as never,
      });
      qc.invalidateQueries({ queryKey: ["import-runs"] });
    } catch {
      /* audit logging must never break an import */
    }
  };


  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              {def.title}
            </CardTitle>
            <CardDescription className="mt-1.5 text-xs leading-relaxed">{def.description}</CardDescription>
          </div>
          <Badge variant="secondary" className="text-[10px]">{def.fields.length} columns</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex flex-wrap gap-1">
            <span className="font-medium text-foreground">Required:</span>
            {required.length ? required.map((r) => <Badge key={r} variant="outline" className="text-[10px] font-normal">{r}</Badge>) : <span>none</span>}
          </div>
          <ul className="space-y-0.5">
            {def.fields.filter((f) => f.hint).map((f) => (
              <li key={f.key} className="flex gap-2">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span><span className="font-medium text-foreground">{f.label}:</span> {f.hint}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => downloadTemplate(def)}>
            <Download className="h-3.5 w-3.5" /> Template
          </Button>
          <Button size="sm" className="flex-1 gap-1.5" disabled={loading} onClick={() => setOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
        </div>
      </CardContent>
      {open && (
        <CsvImportDialog
          title={`Import ${def.title}`}
          templateName={def.templateName}
          fields={def.fields}
          onPreview={def.onPreview}
          onImport={async (rows, meta) => {
            const stats = (await def.onImport(rows, meta)) ?? {};
            await recordRun(rows.length, meta, stats);
            setOpen(false);
          }}
        />
      )}
    </Card>
  );
}

/** Import history — every CSV upload with its counts. */
function ImportHistory() {
  const q = useQuery({
    queryKey: ["import-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-primary" /> Import history
        </CardTitle>
        <CardDescription className="text-xs">Every upload from this shift and before, with row counts.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (q.data ?? []).length === 0 ? (
          <EmptyState icon={HistoryIcon} title="No imports yet" description="Uploads will be listed here with their results." />
        ) : (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead className="table-head bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 px-3 font-medium">When</th>
                  <th className="py-2 px-3 font-medium">Type</th>
                  <th className="py-2 px-3 font-medium">File</th>
                  <th className="py-2 px-3 font-medium">By</th>
                  <th className="py-2 px-3 font-medium text-right">Rows</th>
                  <th className="py-2 px-3 font-medium text-right">New</th>
                  <th className="py-2 px-3 font-medium text-right">Updated</th>
                  <th className="py-2 px-3 font-medium text-right">Skipped</th>
                  <th className="py-2 px-3 font-medium text-right">Invalid</th>
                  <th className="py-2 px-3 font-medium text-right">FTDs</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 transition-colors hover:bg-accent/30">
                    <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 px-3">{r.import_key}</td>
                    <td className="py-2 px-3 max-w-[220px] truncate">{r.file_name ?? "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">{r.user_email ?? "—"}</td>
                    <td className="py-2 px-3 text-right">{r.row_count ?? 0}</td>
                    <td className="py-2 px-3 text-right text-emerald-500">{r.created_count ?? 0}</td>
                    <td className="py-2 px-3 text-right text-amber-500">{r.updated_count ?? 0}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{r.skipped_count ?? 0}</td>
                    <td className="py-2 px-3 text-right">{r.invalid_count ?? 0}</td>
                    <td className="py-2 px-3 text-right">{r.ftd_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportPage() {
  const { defs, isLoading } = useImportDefinitions();

  return (
    <div>
      <PageHeader
        title="Bulk Import"
        description="Upload full data from CSV/Excel, or paste raw client text and let AI structure it."
        actions={<AiClientPasteBulk />}
      />

      <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">How to prepare your file</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Use the <strong>Download Template</strong> button to get the exact column headers.</li>
              <li>Dates must be <code>YYYY-MM-DD</code> (e.g. 2026-07-31).</li>
              <li>For names (employee, affiliate, source, category, lead), use the exact name as it appears in the app.</li>
              <li>Save Excel as <strong>CSV UTF-8</strong> before importing.</li>
              <li>Boolean fields accept <code>true</code>/<code>false</code>, <code>yes</code>/<code>no</code>, or <code>1</code>/<code>0</code>.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {defs.map((def) => (
          <ImportCard key={def.key} def={def} loading={isLoading} />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <span className="text-muted-foreground">All imports are scoped to your current company. IDs are auto-generated by the backend.</span>
      </div>
    </div>
  );
}
