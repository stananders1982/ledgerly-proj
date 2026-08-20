/**
 * Daily reminder for affiliates whose balance sits close to zero.
 *
 * Once a day, each affiliate inside its alert window produces a single
 * notification so a credit never quietly runs out.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useAffiliateBalanceAlerts } from "@/lib/affiliate-alerts";

const STAMP_KEY = "ledgerly:affiliate-balance-alerts";

export function AffiliateBalanceReminders() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: alerts } = useAffiliateBalanceAlerts();

  useEffect(() => {
    if (!user || !alerts?.length) return;
    const today = new Date().toISOString().slice(0, 10);
    let stamp: string | null = null;
    try {
      stamp = localStorage.getItem(STAMP_KEY);
    } catch {
      return;
    }
    if (stamp === today) return;

    (async () => {
      const { data: cid } = await supabase.rpc("current_company_id");
      const rows = alerts.map((a) => ({
        type: "affiliate_balance",
        title: `${a.name}: balance near zero`,
        body: a.message,
        amount: Math.abs(a.balance),
        company_id: cid as any,
      }));
      await supabase.from("notifications").insert(rows as any);
      try { localStorage.setItem(STAMP_KEY, today); } catch { /* ignore */ }
      qc.invalidateQueries({ queryKey: ["notifications"] });
    })().catch(() => {
      /* reminders are best-effort */
    });
  }, [user, alerts, qc]);

  return null;
}
