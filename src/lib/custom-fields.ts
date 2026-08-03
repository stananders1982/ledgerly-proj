/**
 * Admin-defined custom fields.
 *
 * Each module can carry extra fields the workspace cares about without a
 * schema change: definitions live in `custom_field_defs`, values live in a
 * `custom_fields` JSONB column on the record itself.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CustomModule = "leads" | "employees" | "clients" | "revenue";

export const CUSTOM_MODULES: { key: CustomModule; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "employees", label: "Employees" },
  { key: "clients", label: "Clients" },
  { key: "revenue", label: "Income" },
];

export type FieldType = "text" | "number" | "date" | "select";

export const FIELD_TYPES: { key: FieldType; label: string }[] = [
  { key: "text", label: "Text" },
  { key: "number", label: "Number" },
  { key: "date", label: "Date" },
  { key: "select", label: "Dropdown" },
];

export type CustomFieldDef = {
  id: string;
  module: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  options: string[];
  sort_order: number;
  active: boolean;
};

export const CUSTOM_FIELD_DEFS_KEY = ["custom-field-defs"] as const;

export function useCustomFields(module: CustomModule) {
  const q = useQuery({
    queryKey: [...CUSTOM_FIELD_DEFS_KEY, module],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_field_defs")
        .select("id,module,field_key,label,field_type,options,sort_order,active")
        .eq("module", module)
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CustomFieldDef[];
    },
    staleTime: 5 * 60_000,
  });
  return q.data ?? [];
}

/** Turn a free-text label into a stable storage key. */
export function toFieldKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function customFieldValue(record: any, def: CustomFieldDef) {
  const v = record?.custom_fields?.[def.field_key];
  return v === undefined || v === null || v === "" ? "" : String(v);
}
