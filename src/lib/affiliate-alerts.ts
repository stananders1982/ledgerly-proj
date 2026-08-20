/**
 * Affiliate balance alerts.
 *
 * Every affiliate can carry an alert threshold. When its running ledger balance
 * sits inside the -threshold … +threshold window, it needs attention: either the
 * credit paid ahead is nearly used up, or the debt is building back up.
 *
 * Balances are computed exactly like the affiliate statement page: weekly
 * settlement rows since the charging start date, minus payments, rolled forward.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import {
  balanceAlert, balanceActive, openingBalance, mergeWeekRows, weeklyGuarantee,
  weeklyLedger, weekStartOf, type BalanceAlert, type LeadEntryLike,
} from "@/lib/affiliate-balance";

const sb = supabase as any;

type AffRow = {
  id: string;
  name: string;
  active: boolean;
  cpa_rate: number | null;
  guarantee_value: number | null;
  group_key: string | null;
  balance_start_date: string | null;
  opening_balance: number | null;
  balance_activated_at: string | null;
  alert_threshold: number | null;
};

export type AffiliateAlert = BalanceAlert & {
  /** Affiliate to link to (the first member of the billing group). */
  id: string;
  /** Affiliate or billing-group name. */
  name: string;
};

export const AFFILIATE_SELECT =
  "id,name,active,cpa_rate,guarantee_value,group_key,balance_start_date,opening_balance,balance_activated_at,alert_threshold";

/** Running balance + alert for every affiliate (billing groups settle as one). */
export function computeAffiliateAlerts(
  affiliates: AffRow[],
  sources: { id: string; name: string }[],
  entries: LeadEntryLike[],
  payments: { affiliate_id: string | null; date: string; amount: number }[],
): AffiliateAlert[] {
  const srcByName = new Map<string, string>();
  for (const s of sources) srcByName.set(s.name.trim().toLowerCase(), s.id);

  // Group members that share a balance.
  const groups = new Map<string, AffRow[]>();
  for (const a of affiliates) {
    const key = a.group_key?.trim() || `id:${a.id}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  const out: AffiliateAlert[] = [];
  for (const [, members] of groups) {
    const head = members[0];
    if (!balanceActive(head)) continue;
    const start = head.balance_start_date;

    const lifetime = mergeWeekRows(
      members.map((m) => {
        const srcId = srcByName.get(m.name.trim().toLowerCase());
        const mine = entries.filter(
          (e) => e.source_id && e.source_id === srcId && (!start || e.entry_date >= start),
        );
        return weeklyGuarantee(m as any, mine);
      }),
    );

    const memberIds = new Set(members.map((m) => m.id));
    const paidByWeek = new Map<string, number>();
    for (const p of payments) {
      if (!p.affiliate_id || !memberIds.has(p.affiliate_id)) continue;
      if (start && p.date < start) continue;
      const k = weekStartOf(p.date);
      paidByWeek.set(k, (paidByWeek.get(k) ?? 0) + Number(p.amount || 0));
    }

    const opening = openingBalance(head);
    const ledger = weeklyLedger(lifetime, paidByWeek, opening);
    const balance = ledger.length ? ledger[0].closing : opening;

    const alert = balanceAlert(head, balance);
    if (!alert) continue;
    out.push({
      ...alert,
      id: head.id,
      name: head.group_key?.trim() || members.map((m) => m.name).join(" + "),
    });
  }
  return out.sort((a, b) => a.balance - b.balance);
}

/** Live affiliate balance alerts for the current company. */
export function useAffiliateBalanceAlerts() {
  return useQuery({
    queryKey: ["affiliate-balance-alerts"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AffiliateAlert[]> => {
      const [affiliates, sources, entries, payments] = await Promise.all([
        fetchAll(() => sb.from("affiliates").select(AFFILIATE_SELECT)),
        fetchAll(() => sb.from("lead_sources").select("id,name")),
        fetchAll(() =>
          sb.from("daily_lead_entries").select("entry_date,received,invalid,reported,activated,source_id"),
        ),
        fetchAll(() => sb.from("expenses").select("affiliate_id,date,amount").not("affiliate_id", "is", null)),
      ]);
      return computeAffiliateAlerts(
        (affiliates ?? []) as AffRow[],
        (sources ?? []) as { id: string; name: string }[],
        (entries ?? []) as LeadEntryLike[],
        (payments ?? []) as { affiliate_id: string | null; date: string; amount: number }[],
      );
    },
  });
}
