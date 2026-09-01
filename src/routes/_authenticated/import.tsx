import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CsvImportDialog, type ImportField } from "@/components/csv-import";
import { fetchAll } from "@/lib/fetch-all";
import { AiClientPasteBulk } from "@/components/ai-client-paste";

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
  onImport: (rows: Record<string, string>[]) => Promise<void>;
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

    return [
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
            customer_name: (r.customer_name ?? "").trim(),
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
            customer_name: (r.customer_name ?? "").trim(),
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
  }, [qc, employeeByName, affiliateByName, sourceByName, categoryByName, leadByName]);

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
          onImport={async (rows) => {
            await def.onImport(rows);
            setOpen(false);
          }}
        />
      )}
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
