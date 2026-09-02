/**
 * Deposit history for one client: every deposit request raised against this
 * client with its invoice number, amount and where it stands.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { useCompanyBanks } from "@/components/company-banks-admin";
import {
  DEPOSIT_REQUEST_STATUS_LABELS,
  DEPOSIT_REQUEST_STATUS_TONE,
  type DepositRequest,
} from "@/lib/deposit-requests";

export function ClientDepositHistory({ activationId }: { activationId: string }) {
  const { data: banks = [] } = useCompanyBanks();
  const { data = [], isLoading } = useQuery({
    enabled: !!activationId,
    queryKey: ["client-deposit-requests", activationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposit_requests")
        .select("*")
        .eq("activation_id", activationId)
        .order("request_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DepositRequest[];
    },
  });

  const bankName = (id: string | null) => banks.find((b) => b.id === id)?.name ?? "—";

  return (
    <div>
      <h2 className="font-display text-base font-semibold">Deposit history</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Requests raised for this client — pending, awaiting funds and confirmed.
      </p>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No deposit requests for this client yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto scroll-slim rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Bank</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-border/50">
                  <td className="px-3 py-2">{fmtDate(r.confirmed_date ?? r.request_date)}</td>
                  <td className="px-3 py-2 num">{r.invoice_no ? `#${r.invoice_no}` : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{bankName(r.bank_id)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={DEPOSIT_REQUEST_STATUS_TONE[r.status]}>
                      {DEPOSIT_REQUEST_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right num">
                    {Number(r.confirmed_amount ?? r.amount).toLocaleString()} {r.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
