import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

const searchSchema = z.object({ redirect: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in — Ledgerly" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate({ to: redirect ?? "/", replace: true });
  }, [user, redirect, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10 opacity-30"
        style={{ background: "radial-gradient(60% 50% at 50% 0%, var(--primary) 0%, transparent 60%)" }}
      />
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold">Ledgerly</span>
        </div>

        <div className="card-surface p-6">
          <h1 className="text-lg font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-muted-foreground mb-4">Admin access only.</p>
          <LoginForm />
        </div>

        <p className="text-xs text-center text-muted-foreground mt-6">
          By continuing, you agree to operate this workspace responsibly.
        </p>
      </div>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
  };
  return (
    <form onSubmit={submit} className="space-y-3 mt-2">
      <div className="grid gap-2">
        <Label>Email</Label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>Password</Label>
        <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
      </Button>
    </form>
  );
}
