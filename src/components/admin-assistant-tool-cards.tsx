import { useState } from "react";
import { Check, X, Loader2, ShieldCheck, KeyRound, UserCog, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  actionLabel,
  navLabel,
  applyCopyAccess,
  applySetActionPermission,
  applySetPageAccess,
  applySetRole,
  type ApplyResult,
} from "@/lib/admin-chat";

export type ChangeToolName = "set_page_access" | "set_action_permission" | "set_role" | "copy_access";

const META: Record<ChangeToolName, { icon: typeof ShieldCheck; title: string }> = {
  set_page_access: { icon: ShieldCheck, title: "Page access change" },
  set_action_permission: { icon: KeyRound, title: "Action permission change" },
  set_role: { icon: UserCog, title: "Role change" },
  copy_access: { icon: Copy, title: "Copy access" },
};

function describe(tool: ChangeToolName, input: any): { subject: string; lines: string[]; grant: boolean } {
  switch (tool) {
    case "set_page_access":
      return {
        subject: input?.user_label ?? "member",
        grant: !!input?.allowed,
        lines: (input?.pages ?? []).map((p: string) => navLabel(p)),
      };
    case "set_action_permission":
      return {
        subject: input?.user_label ?? "member",
        grant: !!input?.allowed,
        lines: (input?.actions ?? []).map((a: string) => actionLabel(a)),
      };
    case "set_role":
      return { subject: input?.user_label ?? "member", grant: true, lines: [`Role → ${input?.role_label ?? input?.role_key}`] };
    case "copy_access":
      return {
        subject: input?.to_label ?? "member",
        grant: true,
        lines: [`Copy role and overrides from ${input?.from_label ?? "member"}`],
      };
  }
}

export function ChangeProposalCard({
  tool,
  input,
  companyId,
  output,
  onResult,
}: {
  tool: ChangeToolName;
  input: any;
  companyId: string;
  output?: { applied?: boolean; summary?: string; declined?: boolean } | undefined;
  onResult: (output: ApplyResult | { declined: true; summary: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { icon: Icon, title } = META[tool];
  const { subject, lines, grant } = describe(tool, input);
  const settled = !!output;

  const apply = async () => {
    setBusy(true);
    try {
      let res: ApplyResult;
      if (tool === "set_page_access") res = await applySetPageAccess(companyId, input);
      else if (tool === "set_action_permission") res = await applySetActionPermission(companyId, input);
      else if (tool === "set_role") res = await applySetRole(companyId, input);
      else res = await applyCopyAccess(companyId, input);
      toast.success(res.summary);
      onResult(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not apply the change");
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <div className="my-2 rounded-lg border bg-card p-3 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{title}</span>
        <Badge variant={grant ? "default" : "destructive"} className="ml-auto">
          {tool === "set_page_access" || tool === "set_action_permission" ? (grant ? "Grant" : "Revoke") : "Update"}
        </Badge>
      </div>
      <p className="mt-2 text-muted-foreground">
        For <span className="font-medium text-foreground">{subject}</span>
      </p>
      <ul className="mt-1 list-inside list-disc text-muted-foreground">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      {settled ? (
        <p className={`mt-3 text-xs ${output?.applied ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {output?.applied ? "Applied" : "Discarded"}
          {output?.summary ? ` — ${output.summary}` : ""}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={apply} disabled={busy} className="min-h-9">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="min-h-9"
            onClick={() => onResult({ declined: true, summary: "The admin declined this change." })}
          >
            <X className="mr-1 h-4 w-4" />
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
