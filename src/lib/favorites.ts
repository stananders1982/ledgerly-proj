/**
 * Pinned records ("favorites").
 *
 * Any entity in the app can be starred by the current user. Favorites are
 * personal (RLS scopes rows to the signed-in user) and surface at the top of
 * the command palette so daily-driver records are one keystroke away.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type FavoriteEntity = "client" | "employee" | "affiliate";

export type Favorite = {
  id: string;
  entity_type: string;
  entity_id: string;
  label: string | null;
};

export const FAVORITES_KEY = ["favorites"] as const;

export function useFavorites() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("id,entity_type,entity_id,label")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Favorite[];
    },
  });

  const byKey = useMemo(() => {
    const m = new Map<string, Favorite>();
    for (const f of q.data ?? []) m.set(`${f.entity_type}:${f.entity_id}`, f);
    return m;
  }, [q.data]);

  const toggle = useMutation({
    mutationFn: async (v: { entity_type: FavoriteEntity; entity_id: string; label?: string | null }) => {
      const existing = byKey.get(`${v.entity_type}:${v.entity_id}`);
      if (existing) {
        const { error } = await supabase.from("favorites").delete().eq("id", existing.id);
        if (error) throw error;
        return false;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data: companyId } = await supabase.rpc("current_company_id");
      const { error } = await supabase.from("favorites").insert({
        entity_type: v.entity_type,
        entity_id: v.entity_id,
        label: v.label ?? null,
        user_id: auth.user?.id,
        company_id: companyId,
      } as any);
      if (error) throw error;
      return true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
    onError: (e: any) => toast.error(e.message ?? "Could not update favorite"),
  });

  return {
    favorites: q.data ?? [],
    isFavorite: (type: FavoriteEntity, id: string) => byKey.has(`${type}:${id}`),
    toggle,
  };
}
