import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFxRates, fxRate, fmtPrecise } from "@/lib/fx";
import { getDisplayCurrency } from "@/lib/format";

/**
 * Amount input + currency selector with a live conversion preview.
 * `value` is the amount in the chosen currency (stored as-is).
 */
export function AmountWithCurrency({
  value,
  currency,
  onValueChange,
  onCurrencyChange,
}: {
  value: string | number;
  currency: string;
  onValueChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
}) {
  const { currencies, fetchedAt } = useFxRates();
  const base = getDisplayCurrency();
  const amount = Number(value) || 0;
  const rate = fxRate(currency, base);
  const showPreview = currency !== base && amount > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          type="number"
          className="flex-1"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
        <Select value={currency} onValueChange={onCurrencyChange}>
          <SelectTrigger className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c: string) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showPreview && (
        <p className="text-xs text-muted-foreground">
          = <span className="font-medium text-foreground">{fmtPrecise(amount * rate, base)}</span>{" "}
          (1 {currency} = {rate.toFixed(4)} {base}
          {fetchedAt ? `, live ${new Date(fetchedAt).toLocaleTimeString()}` : ""})
        </p>
      )}
    </div>
  );
}
