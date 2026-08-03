/**
 * Admin editor for custom field definitions (Settings → Custom fields).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CUSTOM_FIELD_DEFS_KEY,
  CUSTOM_MODULES,
  FIELD_TYPES,
  toFieldKey,
  type CustomFieldDef,
  type CustomModule,
  type FieldType,
} from "@/lib/custom-fields";

export function CustomFieldsAdmin() {
  const qc = useQueryClient();
  const [module, setModule] = useState<CustomModule>("leads");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");

  const q = useQuery({
    queryKey: [...CUSTOM_FIELD_DEFS_KEY, "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_field_defs")
        .select("id,module,field_key,label,field_type,options,sort_order,active")
        .order("module")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CustomFieldDef[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: CUSTOM_FIELD_DEFS_KEY });

  const add = useMutation({
    mutationFn: async () => {
      const key = toFieldKey(label);
      if (!key) throw new Error("Give the field a name");
      const { data: cid } = await supabase.rpc("current_company_id");
      const { error } = await supabase.from("custom_field_defs").insert({
        module,
        field_key: key,
        label: label.trim(),
        field_type: type,
        options: type === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : [],
        sort_order: (q.data ?? []).filter((d) => d.module === module).length,
        company_id: cid as any,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setLabel("");
      setOptions("");
      invalidate();
      toast.success("Field added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (d: CustomFieldDef) => {
      const { error } = await supabase
        .from("custom_field_defs")
        .update({ active: !d.active })
        .eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_field_defs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Field removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const defs = q.data ?? [];

  return (
    <div className="card-surface p-5">
      <h3 className="font-display text-base font-semibold">Custom fields</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Extra fields your team fills in on leads, employees, clients and income. They show up in forms,
        tables and exports.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <div className="grid gap-1.5">
          <Label className="text-xs">Module</Label>
          <Select value={module} onValueChange={(v) => setModule(v as CustomModule)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOM_MODULES.map((m) => (
                <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Field name</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Country" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Choices (comma separated)</Label>
          <Input
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            disabled={type !== "select"}
            placeholder="Gold, Silver, Bronze"
          />
        </div>
        <div className="flex items-end">
          <Button className="w-full" onClick={() => add.mutate()} disabled={add.isPending || !label.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {defs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom fields defined yet.</p>
        ) : (
          defs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-2"
            >
              <Badge variant="secondary" className="capitalize">{d.module}</Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {d.field_type}
                  {d.options?.length ? ` · ${d.options.join(", ")}` : ""}
                </div>
              </div>
              <Switch checked={d.active} onCheckedChange={() => toggleActive.mutate(d)} />
              <button
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate(d.id)}
                aria-label="Remove field"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
