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
    key: "defaultActivationBalance",
    column: "default_activation_balance",
    label: "Default activation balance",
    hint: "Balance credited automatically when a lead is activated.",
    suffix: "$",
  },
  {
    key: "ftdCommission",
    column: "ftd_commission",
    label: "FTD commission",
    hint: "Paid to the conversion agent for every qualified FTD.",
    suffix: "$",
  },
  {
    key: "withdrawalPenaltyPct",
    column: "withdrawal_penalty_pct",
    label: "Withdrawal penalty",
    hint: "Share of every withdrawal deducted from the responsible agent.",
    suffix: "%",
  },
];

function SettingsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [form, setForm] = useState<Record<keyof CompanySettings, string>>({
    ftdBalanceThreshold: String(DEFAULT_SETTINGS.ftdBalanceThreshold),
    defaultActivationBalance: String(DEFAULT_SETTINGS.defaultActivationBalance),
    ftdCommission: String(DEFAULT_SETTINGS.ftdCommission),
    withdrawalPenaltyPct: String(DEFAULT_SETTINGS.withdrawalPenaltyPct),
  });

  const q = useQuery({
    queryKey: ["company-settings-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("company_id,ftd_balance_threshold,default_activation_balance,ftd_commission,withdrawal_penalty_pct")
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
      defaultActivationBalance: String(s.defaultActivationBalance),
      ftdCommission: String(s.ftdCommission),
      withdrawalPenaltyPct: String(s.withdrawalPenaltyPct),
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const companyId = (q.data as any)?.company_id;
      const payload: any = {};
      for (const f of FIELDS) payload[f.column] = Number(form[f.key]) || 0;
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
      defaultActivationBalance: String(DEFAULT_SETTINGS.defaultActivationBalance),
      ftdCommission: String(DEFAULT_SETTINGS.ftdCommission),
      withdrawalPenaltyPct: String(DEFAULT_SETTINGS.withdrawalPenaltyPct),
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
    </div>
  );
}
