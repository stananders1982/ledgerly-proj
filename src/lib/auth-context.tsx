import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  navKeys: Set<string>;
  permsLoaded: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [navKeys, setNavKeys] = useState<Set<string>>(new Set());
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      setNavKeys(new Set());
      setPermsLoaded(false);
      return;
    }
    const uid = session.user.id;
    Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("nav_permissions").select("nav_key").eq("user_id", uid),
    ]).then(([rolesRes, permsRes]) => {
      setIsAdmin(!!rolesRes.data?.some((r) => r.role === "admin"));
      setNavKeys(new Set((permsRes.data ?? []).map((p: any) => p.nav_key as string)));
      setPermsLoaded(true);
    });
  }, [session?.user?.id]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider
      value={{ user: session?.user ?? null, session, isAdmin, loading, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
