import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import {
  KYC_ITEMS, KYC_STATUS_LABELS, KYC_STATUS_TONE, kycStatus, parseKyc, toggleKyc, type Kyc,
} from "@/lib/kyc";

export function KycBadge({ value, className }: { value: unknown; className?: string }) {
  const s = kycStatus(value);
  return (
    <Badge variant="outline" className={cn(KYC_STATUS_TONE[s], className)}>
      {KYC_STATUS_LABELS[s]}
    </Badge>
  );
}

/**
 * Compliance checklist for one client. Each tick is stamped with who did it
 * and when, so the record stands up to an audit.
 */
export function ClientKycChecklist({
  value, onChange, by, disabled, className,
}: {
  value: unknown;
  onChange: (next: Kyc) => void;
  by?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const kyc = parseKyc(value);
  return (
    <div className={cn("grid gap-2", className)}>
      {KYC_ITEMS.map((item) => {
        const entry = kyc[item.key];
        return (
          <label
            key={item.key}
            className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-accent/30"
          >
            <Checkbox
              checked={!!entry?.done}
              disabled={disabled}
              onCheckedChange={(c) => onChange(toggleKyc(value, item.key, !!c, by))}
            />
            <span className="flex-1">{item.label}</span>
            {entry?.done && entry.at && (
              <span className="text-xs text-muted-foreground">
                {fmtDate(entry.at)}{entry.by ? ` · ${entry.by}` : ""}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
