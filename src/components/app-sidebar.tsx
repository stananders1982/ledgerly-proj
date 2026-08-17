import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, LifeBuoy, LogOut, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth-context";
import { CompanySwitcher } from "@/components/company-switcher";
import { Button } from "@/components/ui/button";

import { NAV_GROUPS, NAV_ITEMS, type NavGroup } from "@/lib/nav-items";
import { useVisibleDashboardSections } from "@/lib/permissions";
import { useOnboardingWizard } from "@/components/onboarding-wizard";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sidebar_groups_open";

function loadOpenState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function AppSidebar({ onSearchClick }: { onSearchClick?: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { signOut, isAdmin, isSuperAdmin, navKeys, permsLoaded } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const { openWizard } = useOnboardingWizard();
  const dashSections = useVisibleDashboardSections();

  useEffect(() => {
    setOpenMap(loadOpenState());
  }, []);

  const setGroupOpen = (group: string, open: boolean) => {
    setOpenMap((prev) => {
      const next = { ...prev, [group]: open };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const items = NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (isAdmin) return true;
    if (item.adminOnly) return false;
    if (!permsLoaded) return false;
    // Any visible dashboard block implies access to the Dashboard page.
    if (item.key === "dashboard") return navKeys.has("dashboard") || dashSections.any;
    return navKeys.has(item.key);
  });

  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  const renderItems = (groupItems: typeof items) => (
    <SidebarMenu>
      {groupItems.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
            <Link to={item.url} className="flex items-center gap-2">
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-1 p-1.5">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-display text-sm font-semibold tracking-tight">Ledgerly</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Simple ledger</span>
            </div>
          )}
        </div>
        {!collapsed && <CompanySwitcher />}
        {onSearchClick && !collapsed && (
          <button
            type="button"
            onClick={onSearchClick}
            className="mx-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
            <kbd className="ml-auto rounded border border-sidebar-border px-1 py-0.5 text-[10px]">⌘K</kbd>
          </button>
        )}
      </SidebarHeader>

      <SidebarContent>
        {collapsed ? (
          <SidebarGroup>
            <SidebarGroupContent>{renderItems(items)}</SidebarGroupContent>
          </SidebarGroup>
        ) : (
          NAV_GROUPS.map((group: NavGroup) => {
            const groupItems = items.filter((i) => i.group === group);
            if (!groupItems.length) return null;
            const hasActive = groupItems.some((i) => isActive(i.url));
            const open = openMap[group] ?? true;
            const effectiveOpen = hasActive ? true : open;
            return (
              <Collapsible
                key={group}
                open={effectiveOpen}
                onOpenChange={(o) => setGroupOpen(group, o)}
                className="group/collapsible"
              >
                <SidebarGroup>
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger className="flex w-full items-center justify-between">
                      {group}
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 transition-transform", effectiveOpen && "rotate-90")}
                      />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>{renderItems(groupItems)}</SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          })
        )}
      </SidebarContent>

      <SidebarFooter className="space-y-1">
        <ThemeToggle collapsed={collapsed} />
        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={openWizard}>
          <LifeBuoy className="h-4 w-4" /> {!collapsed && "Setup guide"}
        </Button>
        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" /> {!collapsed && "Sign out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
