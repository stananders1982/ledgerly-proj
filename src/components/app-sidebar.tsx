import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Receipt, TrendingUp, FileBarChart, Sparkles,
  UserCog, Lightbulb, Upload, Settings as SettingsIcon, Target, BarChart3,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";

const main = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Insights", url: "/insights", icon: Lightbulb },
];
const ops = [
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Revenue", url: "/revenue", icon: TrendingUp },
  { title: "Expenses", url: "/expenses", icon: Receipt },
];
const team = [
  { title: "Employees", url: "/employees", icon: UserCog },
  { title: "Lead Sources", url: "/lead-sources", icon: Target },
  { title: "Performance", url: "/performance", icon: FileBarChart },
];
const tools = [
  { title: "Import", url: "/import", icon: Upload },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin } = useAuth();
  const renderGroup = (label: string, items: typeof main) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
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
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-semibold tracking-tight">Ledgerly</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sales OS</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Overview", main)}
        {renderGroup("Operations", ops)}
        {renderGroup("Team", team)}
        {renderGroup("Tools", tools)}
        {isAdmin && renderGroup("Admin", [{ title: "Settings", url: "/settings", icon: SettingsIcon }])}
      </SidebarContent>
    </Sidebar>
  );
}
