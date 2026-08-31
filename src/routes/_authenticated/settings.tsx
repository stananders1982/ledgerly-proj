import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DEFAULT_SETTINGS, SETTINGS_QUERY_KEY, fromRow, type CompanySettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth-context";
import { BackupExport } from "@/components/backup-export";
import { CustomFieldsAdmin } from "@/components/custom-fields-admin";
import { ActionPermissionsAdmin } from "@/components/action-permissions-admin";
import { ApiKeysAdmin } from "@/components/api-keys-admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Company Settings — Ledgerly" },
      { name: "description", content: "Tune FTD thresholds, commissions and withdrawal penalties for your workspace." },
      { property: "og:title", content: "Company Settings — Ledgerly" },
      { property: "og:description", content: "Tune FTD thresholds, commissions and withdrawal penalties for your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

import { FX_CURRENCIES } from "@/lib/fx";

const CURRENCIES = [...FX_CURRENCIES];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const FIELDS: {
  key: keyof CompanySettings;
  column: string;
  label: string;
  hint: string;
  suffix?: string;
}[] = [
  {
    key: "ftdBalanceThreshold",
    column: "ftd_balance_threshold",
    label: "FTD balance threshold",
    hint: "A low-potential client counts as an FTD once their effective balance reaches this amount.",
    suffix: "$",
  },
  {
    key: "whaleThreshold",
    column: "whale_threshold",
    label: "Whale threshold",
    hint: "A client counts as a whale once their potential value reaches this amount.",
    suffix: "$",
  },
  {
    key: "highThreshold",
    column: "high_threshold",
    label: "High value threshold",
    hint: "Potential value at which a client counts as High value (below the whale band).",
    suffix: "$",
  },
  {
    key: "midThreshold",
    column: "mid_threshold",
    label: "Mid value threshold",
    hint: "Potential value at which a client counts as Mid value.",
    suffix: "$",
  },
  {
    key: "smallThreshold",
    column: "small_threshold",
    label: "Small value threshold",
    hint: "Minimum potential value for a client to be rated Small rather than Unrated.",
    suffix: "$",
  },
  {
    key: "defaultActivationBalance",
    column: "default_activation_balance",
    label: "Default activation balance",
    hint: "Balance credited automatically when a lead is activated.",
    suffix: "$",
  },
  {
    key: "withdrawalPenaltyPct",
    column: "withdrawal_penalty_pct",
    label: "Withdrawal penalty",
    hint: "Share of every withdrawal deducted from the responsible agent.",
    suffix: "%",
  },
  {
    key: "methodFeeWirePct",
    column: "method_fee_wire_pct",
    label: "Wire method fee",
    hint: "Percentage deducted from wire deposits before commission is calculated.",
    suffix: "%",
  },
  {
    key: "methodFeeCardPct",
    column: "method_fee_card_pct",
    label: "Card method fee",
    hint: "Percentage deducted from card deposits before commission is calculated.",
    suffix: "%",
  },
  {
    key: "methodFeeCryptoPct",
    column: "method_fee_crypto_pct",
    label: "Crypto method fee",
    hint: "Percentage deducted from crypto deposits before commission is calculated.",
    suffix: "%",
  },
];

function SettingsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({
    ftdBalanceThreshold: String(DEFAULT_SETTINGS.ftdBalanceThreshold),
      whaleThreshold: String(DEFAULT_SETTINGS.whaleThreshold),
    highThreshold: String(DEFAULT_SETTINGS.highThreshold),
    midThreshold: String(DEFAULT_SETTINGS.midThreshold),
    smallThreshold: String(DEFAULT_SETTINGS.smallThreshold),
    defaultActivationBalance: String(DEFAULT_SETTINGS.defaultActivationBalance),
    ftdCommission: String(DEFAULT_SETTINGS.ftdCommission),
    withdrawalPenaltyPct: String(DEFAULT_SETTINGS.withdrawalPenaltyPct),
    methodFeeWirePct: String(DEFAULT_SETTINGS.methodFeeWirePct),
    methodFeeCardPct: String(DEFAULT_SETTINGS.methodFeeCardPct),
    methodFeeCryptoPct: String(DEFAULT_SETTINGS.methodFeeCryptoPct),
  });
  const [branding, setBranding] = useState({
    currency: DEFAULT_SETTINGS.currency,
    fiscal_year_start_month: String(DEFAULT_SETTINGS.fiscalYearStartMonth),
    brand_color: "",
    logo_url: "",
  });

  const q = useQuery({
    queryKey: ["company-settings-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("company_id,ftd_balance_threshold,whale_threshold,high_threshold,mid_threshold,small_threshold,default_activation_balance,ftd_commission,withdrawal_penalty_pct,method_fee_wire_pct,method_fee_card_pct,method_fee_crypto_pct,currency,fiscal_year_start_month,brand_color,logo_url")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!q.data) return;
    const s = fromRow(q.data as any);
    setForm({
      ftdBalanceThreshold: String(s.ftdBalanceThreshold),
      whaleThreshold: String(s.whaleThreshold),
      highThreshold: String(s.highThreshold),
      midThreshold: String(s.midThreshold),
      smallThreshold: String(s.smallThreshold),
      defaultActivationBalance: String(s.defaultActivationBalance),
      ftdCommission: String(s.ftdCommission),
      withdrawalPenaltyPct: String(s.withdrawalPenaltyPct),
      methodFeeWirePct: String(s.methodFeeWirePct),
      methodFeeCardPct: String(s.methodFeeCardPct),
      methodFeeCryptoPct: String(s.methodFeeCryptoPct),
    });
    setBranding({
      currency: s.currency,
      fiscal_year_start_month: String(s.fiscalYearStartMonth),
      brand_color: s.brandColor ?? "",
      logo_url: s.logoUrl ?? "",
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const companyId = (q.data as any)?.company_id;
      const payload: any = {};
      for (const f of FIELDS) payload[f.column] = Number(form[f.key]) || 0;
      payload.currency = branding.currency || "USD";
      payload.fiscal_year_start_month = Number(branding.fiscal_year_start_month) || 1;
      payload.brand_color = branding.brand_color.trim() || null;
      payload.logo_url = branding.logo_url.trim() || null;
      if (companyId) {
        const { error } = await supabase.from("company_settings").update(payload).eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { data: cid, error: cErr } = await supabase.rpc("current_company_id");
        if (cErr) throw cErr;
        const { error } = await supabase
          .from("company_settings")
          .insert({ ...payload, company_id: cid } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["company-settings-page"] });
      toast.success("Settings saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save settings"),
  });

  const resetDefaults = () =>
    setForm({
      ftdBalanceThreshold: String(DEFAULT_SETTINGS.ftdBalanceThreshold),
      whaleThreshold: String(DEFAULT_SETTINGS.whaleThreshold),
    highThreshold: String(DEFAULT_SETTINGS.highThreshold),
    midThreshold: String(DEFAULT_SETTINGS.midThreshold),
    smallThreshold: String(DEFAULT_SETTINGS.smallThreshold),
      defaultActivationBalance: String(DEFAULT_SETTINGS.defaultActivationBalance),
      ftdCommission: String(DEFAULT_SETTINGS.ftdCommission),
      withdrawalPenaltyPct: String(DEFAULT_SETTINGS.withdrawalPenaltyPct),
      methodFeeWirePct: String(DEFAULT_SETTINGS.methodFeeWirePct),
      methodFeeCardPct: String(DEFAULT_SETTINGS.methodFeeCardPct),
      methodFeeCryptoPct: String(DEFAULT_SETTINGS.methodFeeCryptoPct),
    });

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Company Settings"
        description="The numbers behind FTDs, commissions and penalties — per workspace."
        actions={
          isAdmin ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetDefaults}>
                <RotateCcw className="h-4 w-4" /> Defaults
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Save changes
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="card-surface p-5 grid gap-5">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label className="text-xs">{f.label}</Label>
            <div className="flex items-center gap-2 max-w-xs">
              {f.suffix === "$" && <span className="text-muted-foreground">$</span>}
              <Input
                type="number"
                step="0.01"
                value={form[f.key]}
                disabled={!isAdmin}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
              {f.suffix === "%" && <span className="text-muted-foreground">%</span>}
            </div>
            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">Only company admins can change these values.</p>
        )}
      </div>

      <div className="card-surface mt-6 grid gap-5 p-5">
        <div>
          <h2 className="font-display text-base font-semibold">Workspace &amp; branding</h2>
          <p className="mt-1 text-xs text-muted-foreground">Currency, fiscal year and the accent colour used across the app.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Currency</Label>
            <Select value={branding.currency} disabled={!isAdmin} onValueChange={(v) => setBranding({ ...branding, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Applied to every money figure in the app.</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Fiscal year starts</Label>
            <Select
              value={branding.fiscal_year_start_month}
              disabled={!isAdmin}
              onValueChange={(v) => setBranding({ ...branding, fiscal_year_start_month: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used by fiscal-year reporting ranges.</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Accent colour</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                className="h-9 w-14 p-1"
                disabled={!isAdmin}
                value={branding.brand_color || "#6366f1"}
                onChange={(e) => setBranding({ ...branding, brand_color: e.target.value })}
              />
              <Input
                placeholder="#6366f1"
                disabled={!isAdmin}
                value={branding.brand_color}
                onChange={(e) => setBranding({ ...branding, brand_color: e.target.value })}
              />
              {branding.brand_color && isAdmin && (
                <Button variant="ghost" size="sm" onClick={() => setBranding({ ...branding, brand_color: "" })}>Clear</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Leave empty to keep the default theme accent.</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Logo URL</Label>
            <Input
              placeholder="https://…/logo.png"
              disabled={!isAdmin}
              value={branding.logo_url}
              onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Shown in the sidebar next to the workspace name.</p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <CustomFieldsAdmin />
      </div>

      <div className="mt-6">
        <ActionPermissionsAdmin />
      </div>

      <div className="mt-6">
        <ApiKeysAdmin />
      </div>

      <div className="mt-6">
        <BackupExport />
      </div>
    </div>
  );
}
