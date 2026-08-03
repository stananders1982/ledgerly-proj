/**
 * Renders admin-defined custom fields inside any create/edit form, and a
 * read-only summary for detail views.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomFields, type CustomModule } from "@/lib/custom-fields";
import { cn } from "@/lib/utils";

export function CustomFieldInputs({
  module,
  value,
  onChange,
  className,
}: {
  module: CustomModule;
  value: Record<string, any> | null | undefined;
  onChange: (next: Record<string, any>) => void;
  className?: string;
}) {
  const defs = useCustomFields(module);
  if (defs.length === 0) return null;
  const vals = value ?? {};
  const set = (k: string, v: any) => onChange({ ...vals, [k]: v });

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {defs.map((d) => (
        <div key={d.id} className="grid gap-1.5">
          <Label className="text-xs">{d.label}</Label>
          {d.field_type === "select" ? (
            <Select value={vals[d.field_key] ?? ""} onValueChange={(v) => set(d.field_key, v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {(d.options ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={d.field_type === "number" ? "number" : d.field_type === "date" ? "date" : "text"}
              value={vals[d.field_key] ?? ""}
              onChange={(e) => set(d.field_key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function CustomFieldSummary({
  module,
  record,
  className,
}: {
  module: CustomModule;
  record: any;
  className?: string;
}) {
  const defs = useCustomFields(module);
  const filled = defs.filter((d) => {
    const v = record?.custom_fields?.[d.field_key];
    return v !== undefined && v !== null && v !== "";
  });
  if (filled.length === 0) return null;

  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3", className)}>
      {filled.map((d) => (
        <div key={d.id} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{d.label}</dt>
          <dd className="truncate text-sm">{String(record.custom_fields[d.field_key])}</dd>
        </div>
      ))}
    </dl>
  );
}
