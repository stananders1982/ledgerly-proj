import { createFileRoute, Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeSwitch } from "@/components/theme-switch";
import { DensityToggle } from "@/components/density-provider";
import { LiveClock } from "@/components/live-clock";
import { useAuth } from "@/lib/auth-context";
import { useWorkspaceBranding } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, UserCircle, Search as SearchIcon, Keyboard } from "lucide-react";
import { KeyboardShortcutsPanel, useKeyboardShortcutsPanel } from "@/components/keyboard-shortcuts";
import { QuickCreate } from "@/components/quick-create";
import { TaskReminders } from "@/components/task-reminders";
import { AffiliateBalanceReminders } from "@/components/affiliate-balance-reminders";

import { UnallocatedFtdAlert } from "@/components/unallocated-ftd-alert";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { OnboardingProvider } from "@/components/onboarding-wizard";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const palette = useCommandPalette();
  const shortcuts = useKeyboardShortcutsPanel();
  useWorkspaceBranding();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: pathname }, replace: true });
  }, [loading, user, navigate, pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = (user.user_metadata?.full_name || user.email || "?")
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SidebarProvider>
      <OnboardingProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar onSearchClick={() => palette.setOpen(true)} />
        <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
        <KeyboardShortcutsPanel open={shortcuts.open} onOpenChange={shortcuts.setOpen} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border px-4 sticky top-0 z-10 bg-background/80 backdrop-blur">
            <SidebarTrigger />
            <LiveClock className="flex items-center gap-1 text-xs" />

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => palette.setOpen(true)}
              >
                <SearchIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden md:inline rounded border border-border px-1 py-0.5 text-[10px]">⌘K</kbd>
              </Button>
              <DensityToggle />
              <ThemeSwitch />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile"><UserCircle className="h-4 w-4 mr-2" /> Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shortcuts.setOpen(true)}>
                    <Keyboard className="h-4 w-4 mr-2" /> Shortcuts <kbd className="ml-auto text-[10px]">?</kbd>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="h-4 w-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 p-4 pb-24 sm:p-6 md:pb-6 lg:p-8 max-w-[1400px] w-full mx-auto" role="main">
            <UnallocatedFtdAlert />
            <div className="page-fade-in" key={pathname}>
              <Outlet />
            </div>
          </main>
          <MobileBottomNav />
          <QuickCreate />
          <TaskReminders />
          <AffiliateBalanceReminders />

        </div>
      </div>
      </OnboardingProvider>
    </SidebarProvider>
  );
}
