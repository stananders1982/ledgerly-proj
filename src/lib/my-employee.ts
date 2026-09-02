/**
 * The employee record linked to the signed-in user.
 *
 * Used to scope pages to "my" records — a retention agent should only see the
 * clients allocated to them, not the whole workspace book.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyRoleKey } from "@/lib/permissions";

export type MyEmployee = { id: string; name: string; team: string | null } | null;

export function useMyEmployee() {
  const { user, companyId, isAdmin } = useAuth();
  const { roleKey } = useMyRoleKey();
  const q = useQuery({
    enabled: !!user && !!companyId,
    queryKey: ["my-employee", user?.id, companyId],
    staleTime: 60_000,
    queryFn: async (): Promise<MyEmployee> => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, team")
        .eq("company_id", companyId!)
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as MyEmployee) ?? null;
    },
  });
  /** Agents and retention users only ever work on their own book. */
  const isScoped = !isAdmin && (roleKey === "agent" || roleKey === "retention");
  return { employee: q.data ?? null, isLoading: q.isLoading, isScoped };
}

