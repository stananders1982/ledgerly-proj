import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Banknote, CalendarCheck, CheckSquare, Receipt, TrendingUp, Target, Users, UserCog, Building2, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useFavorites } from "@/lib/favorites";
import { requestQuickCreate, type QuickCreateKey } from "@/lib/quick-create";

const QUICK_ACTIONS: {
  label: string;
  to: string;
  icon: typeof TrendingUp;
  key: string;
  create?: QuickCreateKey;
}[] = [
  { label: "Record a deposit", to: "/revenue", icon: TrendingUp, key: "revenue", create: "revenue" },
  { label: "Add an expense", to: "/expenses", icon: Receipt, key: "expenses", create: "expenses" },
  { label: "Record a withdrawal", to: "/withdrawals", icon: Banknote, key: "withdrawals", create: "withdrawals" },
  { label: "Add a lead entry", to: "/leads", icon: Target, key: "leads", create: "leads" },
  { label: "Create a task", to: "/tasks", icon: CheckSquare, key: "tasks", create: "tasks" },
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

function useEntitySearch(enabled: boolean) {
  const clientsQ = useQuery({
    enabled,
    queryKey: ["cmd-clients"],
    queryFn: async () => {
      const data = await fetchAll(() =>
        supabase
          .from("daily_lead_activations")
          .select("id,lead_name")
          .not("lead_name", "is", null)
          .order("lead_name"),
      );
      return (data ?? []) as { id: string; lead_name: string }[];
    },
  });

  const leadsQ = useQuery({
    enabled,
    queryKey: ["cmd-leads"],
    queryFn: async () => {
      const data = await fetchAll(() =>
        supabase.from("leads").select("id,name").order("name"),
      );
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const employeesQ = useQuery({
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; active: boolean }[];
    },
    queryKey: ["cmd-employees"],
  });

  const affiliatesQ = useQuery({
    enabled,
    queryFn: async () => {
      const data = await fetchAll(() =>
        supabase.from("affiliates").select("id,name").eq("active", true).order("name").limit(100),
      );
      return (data ?? []) as { id: string; name: string }[];
    },
    queryKey: ["cmd-affiliates"],
  });

  return { clientsQ, employeesQ, affiliatesQ };
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { isAdmin, navKeys, permsLoaded } = useAuth();
  const { clientsQ, employeesQ, affiliatesQ } = useEntitySearch(open);
  const { favorites } = useFavorites();

  const allowed = NAV_ITEMS.filter((item) => {
    if (isAdmin) return true;
    if (item.adminOnly) return false;
    if (!permsLoaded) return false;
    return navKeys.has(item.key);
  });

  const clients = useMemo(() => {
    const seen = new Set<string>();
    const rows: { id: string; name: string }[] = [];
    for (const c of clientsQ.data ?? []) {
      const name = (c.lead_name ?? "").trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      rows.push({ id: c.id, name });
    }
    return rows.slice(0, 20);
  }, [clientsQ.data]);

  const employees = useMemo(() => (employeesQ.data ?? []).slice(0, 20), [employeesQ.data]);
  const affiliates = useMemo(() => (affiliatesQ.data ?? []).slice(0, 20), [affiliatesQ.data]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  const openFavorite = (f: { entity_type: string; entity_id: string; label: string | null }) => {
    onOpenChange(false);
    if (f.entity_type === "client") {
      navigate({ to: "/activations", search: { client: f.entity_id, name: f.label ?? undefined } });
    } else if (f.entity_type === "employee") {
      navigate({ to: "/employees/$id", params: { id: f.entity_id } });
    } else if (f.entity_type === "affiliate") {
      navigate({ to: "/affiliates/$id", params: { id: f.entity_id } });
    }
  };

  const actions = QUICK_ACTIONS.filter((a) => allowed.some((i) => i.key === a.key));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, clients, employees, affiliates..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {favorites.length > 0 && (
          <CommandGroup heading="Pinned">
            {favorites.map((f) => (
              <CommandItem
                key={f.id}
                value={`pinned ${f.label ?? f.entity_type}`}
                onSelect={() => openFavorite(f)}
              >
                <Star className="mr-2 h-4 w-4 fill-current text-amber-500" />
                {f.label ?? "Untitled"}
                <span className="ml-auto text-xs capitalize text-muted-foreground">{f.entity_type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
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
                <CommandItem
                  key={a.label}
                  value={`${a.label} new create`}
                  onSelect={() => {
                    if (a.create) requestQuickCreate(a.create);
                    go(a.to);
                  }}
                >
                  <a.icon className="mr-2 h-4 w-4" />
                  {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {clients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients">
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`client ${c.name}`}
                  onSelect={() => {
                    onOpenChange(false);
                    navigate({ to: "/activations", search: { client: c.id, name: c.name } });
                  }}
                >
                  <Users className="mr-2 h-4 w-4" />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {employees.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Employees">
              {employees.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`employee ${e.name}`}
                  onSelect={() => {
                    onOpenChange(false);
                    navigate({ to: "/employees/$id", params: { id: e.id } });
                  }}
                >
                  <UserCog className="mr-2 h-4 w-4" />
                  {e.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {affiliates.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Affiliates">
              {affiliates.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`affiliate ${a.name}`}
                  onSelect={() => {
                    onOpenChange(false);
                    navigate({ to: "/affiliates/$id", params: { id: a.id } });
                  }}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
