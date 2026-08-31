/**
 * Monthly close: which months are locked, and how far reconciliation got.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PeriodClose = {
  id: string;
  period_month: string;
  closed_at: string;
  user_email: string | null;
  notes: string | null;
};

export const PERIOD_CLOSES_KEY = ["period-closes"] as const;

export function usePeriodCloses() {
  return useQuery({
    queryKey: PERIOD_CLOSES_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<PeriodClose[]> => {
      const { data, error } = await supabase
        .from("period_closes")
        .select("id, period_month, closed_at, user_email, notes")
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PeriodClose[];
    },
  });
}

/** YYYY-MM for a date string or Date. */
export function monthKey(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** All months from the earliest transaction to the current month, newest first. */
export function monthRange(earliest: string | null): string[] {
  const now = new Date();
  const start = earliest ? new Date(`${earliest.slice(0, 7)}-01T00:00:00`) : new Date(now.getFullYear(), 0, 1);
  const out: string[] = [];
  const cur = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cur >= start && out.length < 60) {
    out.push(monthKey(cur));
    cur.setMonth(cur.getMonth() - 1);
  }
  return out;
}

export const isMonthClosed = (month: string, closes: PeriodClose[] | undefined) =>
  !!closes?.some((c) => c.period_month === month);
