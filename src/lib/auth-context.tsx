import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export type CompanyOption = { id: string; name: string; slug: string; active: boolean };

interface AuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  companyId: string | null;
  company: CompanyOption | null;
  companies: CompanyOption[];
  switchCompany: (companyId: string) => Promise<void>;
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
  const [mfaRequired, setMfaRequired] = useState(false);
  const [aalChecked, setAalChecked] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const checkAAL = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needs = !!data && data.currentLevel === "aal1" && data.nextLevel === "aal2";
    setMfaRequired(needs);
    setAalChecked(true);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") {
        setMfaRequired(false);
        setAalChecked(true);
      } else if (s) {
        setAalChecked(false);
        checkAAL();
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) checkAAL();
      else setAalChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router, checkAAL]);

  useEffect(() => {
    if (!session?.user || mfaRequired) {
      setIsAdmin(false);
      setNavKeys(new Set());
      setPermsLoaded(false);
      setIsSuperAdmin(false);
      setCompanyId(null);
      setCompanies([]);
      return;
    }
    const uid = session.user.id;
    Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("nav_permissions").select("nav_key").eq("user_id", uid),
      supabase.from("company_users").select("company_id").eq("user_id", uid).maybeSingle(),
      supabase.from("super_admins").select("user_id").eq("user_id", uid).maybeSingle(),
      supabase.from("companies").select("id, name, slug, active").order("name"),
    ]).then(([rolesRes, permsRes, memberRes, superRes, companiesRes]) => {
      setIsAdmin(!!rolesRes.data?.some((r) => r.role === "admin"));
      setNavKeys(new Set((permsRes.data ?? []).map((p: any) => p.nav_key as string)));
      setPermsLoaded(true);
      setCompanyId(memberRes.data?.company_id ?? null);
      setIsSuperAdmin(!!superRes.data);
      setCompanies((companiesRes.data ?? []) as CompanyOption[]);
    });
  }, [session?.user?.id, mfaRequired, companyVersion]);

  const switchCompany = useCallback(
    async (id: string) => {
      await switchCompanyFn({ data: { company_id: id } });
      setCompanyId(id);
      setCompanyVersion((v) => v + 1);
      await queryClient.cancelQueries();
      queryClient.clear();
      await queryClient.invalidateQueries();
      router.invalidate();
    },
    [queryClient, router],
  );

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  };

  const showChallenge = !!session && aalChecked && mfaRequired;
  const company = companies.find((c) => c.id === companyId) ?? null;

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        isAdmin,
        isSuperAdmin,
        companyId,
        company,
        companies,
        switchCompany,
        navKeys,
        permsLoaded,
        loading,
        signOut,
      }}
    >

      {children}
      {showChallenge && <MfaChallengeScreen onVerified={checkAAL} onCancel={signOut} />}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

function MfaChallengeScreen({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      const totp = factors.data?.totp?.find((f) => f.status === "verified");
      if (!totp) {
        toast.error("No verified authenticator found");
        return;
      }
      const challenge = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) throw verify.error;
      toast.success("Verified");
      onVerified();
    } catch (err: any) {
      toast.error(err.message ?? "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background/95 backdrop-blur">
      <form onSubmit={submit} className="card-surface p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-primary/15 text-primary flex items-center justify-center">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h1 className="font-semibold">Two-factor authentication</h1>
            <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Verification code</Label>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Verify
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          Cancel and sign out
        </Button>
      </form>
    </div>
  );
}
