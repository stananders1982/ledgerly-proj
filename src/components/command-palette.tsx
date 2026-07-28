import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Banknote, CalendarCheck, Receipt, TrendingUp } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav-items";
import { useAuth } from "@/lib/auth-context";

const QUICK_ACTIONS = [
  { label: "Add income", to: "/revenue", icon: TrendingUp, key: "revenue" },
  { label: "Add expense", to: "/expenses", icon: Receipt, key: "expenses" },
  { label: "Record withdrawal", to: "/withdrawals", icon: Banknote, key: "withdrawals" },
  { label: "Mark attendance", to: "/attendance", icon: CalendarCheck, key: "attendance" },
];

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { isAdmin, navKeys, permsLoaded } = useAuth();

  const allowed = NAV_ITEMS.filter((item) => {
    if (isAdmin) return true;
    if (item.adminOnly) return false;
    if (!permsLoaded) return false;
    return navKeys.has(item.key);
  });

  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  const actions = QUICK_ACTIONS.filter((a) => allowed.some((i) => i.key === a.key));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {NAV_GROUPS.map((group) => {
          const items = allowed.filter((i) => i.group === group);
          if (!items.length) return null;
          return (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem key={item.url} value={`${group} ${item.title}`} onSelect={() => go(item.url)}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        {actions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick actions">
              {actions.map((a) => (
                <CommandItem key={a.label} value={a.label} onSelect={() => go(a.to)}>
                  <a.icon className="mr-2 h-4 w-4" />
                  {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
