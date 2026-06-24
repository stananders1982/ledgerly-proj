import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, Receipt, TrendingUp, UserCog, Sparkles, LogOut, Repeat, Tag, FileBarChart, CalendarCheck, Handshake } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Sources", url: "/sources", icon: Tag },
  { title: "Income", url: "/revenue", icon: TrendingUp },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Recurring", url: "/recurring", icon: Repeat },
  { title: "Employees", url: "/employees", icon: UserCog },
  { title: "Attendance", url: "/attendance", icon: CalendarCheck },
  { title: "Affiliates", url: "/affiliates", icon: Handshake },
  { title: "Reports", url: "/reports", icon: FileBarChart },
];


export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-semibold tracking-tight">Ledgerly</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Simple ledger</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
