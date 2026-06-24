import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff, Smartphone, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Ledgerly" }] }),
  component: ProfilePage,
});

type Factor = { id: string; status: string; friendly_name?: string | null };

function ProfilePage() {
  const { user } = useAuth();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const verified = factors.filter((f) => f.status === "verified");
  const hasMfa = verified.length > 0;

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      // Clean up any unverified factors first
      for (const f of factors.filter((f) => f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;
      setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err: any) {
      toast.error(err.message ?? "Could not start enrollment");
    } finally {
      setEnrolling(false);
    }
  };

  const cancelEnroll = async () => {
    if (pending) await supabase.auth.mfa.unenroll({ factorId: pending.factorId });
    setPending(null);
    setCode("");
    refresh();
  };

  const verifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setVerifying(true);
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: pending.factorId });
      if (ch.error) throw ch.error;
      const v = await supabase.auth.mfa.verify({
        factorId: pending.factorId,
        challengeId: ch.data.id,
        code: code.trim(),
      });
      if (v.error) throw v.error;
      toast.success("Two-factor authentication enabled");
      setPending(null);
      setCode("");
      refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Invalid code");
    } finally {
      setVerifying(false);
    }
  };

  const removeFactor = async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return toast.error(error.message);
    toast.success("Two-factor disabled");
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description={user?.email ?? ""} />

      <div className="card-surface p-6 space-y-4 max-w-2xl">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">Two-factor authentication</h2>
            <p className="text-sm text-muted-foreground">
              Require a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…) at sign-in.
            </p>
          </div>
          {hasMfa && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-emerald-500/15 text-emerald-300">Enabled</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : pending ? (
          <form onSubmit={verifyEnroll} className="space-y-4 border-t border-border pt-4">
            <div>
              <h3 className="text-sm font-medium mb-2">1. Scan this QR code</h3>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="bg-white p-2 rounded">
                  <img src={pending.qr} alt="TOTP QR code" className="h-44 w-44" />
                </div>
                <div className="text-xs space-y-2">
                  <p className="text-muted-foreground">Or enter this secret manually:</p>
                  <code className="block break-all bg-muted/30 px-2 py-1 rounded text-foreground">{pending.secret}</code>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>2. Enter the 6-digit code shown in your app</Label>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={verifying || code.length < 6}>
                {verifying && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enable
              </Button>
              <Button type="button" variant="ghost" onClick={cancelEnroll}>Cancel</Button>
            </div>
          </form>
        ) : hasMfa ? (
          <div className="space-y-2 border-t border-border pt-4">
            {verified.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <span>{f.friendly_name || "Authenticator app"}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeFactor(f.id)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-t border-border pt-4">
            <Button onClick={startEnroll} disabled={enrolling}>
              {enrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldOff className="h-4 w-4 mr-2" />}
              Set up two-factor
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
