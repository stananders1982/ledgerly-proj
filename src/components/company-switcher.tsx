import { useState } from "react";
import { Check, ChevronsUpDown, Landmark, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CompanySwitcher() {
  const { company, companies, isSuperAdmin, switchCompany } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!company) return null;

  const label = (
    <>
      <Landmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{company.name}</span>
    </>
  );

  if (!isSuperAdmin || companies.length < 2) {
    return (
      <div className="mx-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2.5 py-1.5 text-xs">
        {label}
      </div>
    );
  }

  const pick = async (id: string) => {
    if (id === company.id || busy) return;
    setBusy(true);
    try {
      await switchCompany(id);
      toast.success("Switched company");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not switch company");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mx-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2.5 py-1.5 text-xs transition-colors hover:bg-sidebar-accent"
        >
          {label}
          {busy ? (
            <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Companies</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => pick(c.id)} className="gap-2">
            <Check className={cn("h-3.5 w-3.5", c.id === company.id ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{c.name}</span>
            {!c.active && <span className="ml-auto text-[10px] text-muted-foreground">inactive</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
