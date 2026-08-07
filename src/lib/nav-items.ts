import { KeyRound, Settings, LayoutDashboard, Users, UserCheck, Receipt, TrendingUp, UserCog, Repeat, Tag, FileBarChart, CalendarCheck, ShieldCheck, ShieldAlert, Banknote, Gauge, Building2, Landmark, ScrollText, ListTodo, Upload, History } from "lucide-react";

export type NavGroup = "Overview" | "Operations" | "People" | "Analytics" | "Admin";

export type NavItem = {
  key: string;
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  group: NavGroup;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};


export const NAV_GROUPS: NavGroup[] = ["Overview", "Operations", "People", "Analytics", "Admin"];

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", title: "Dashboard", url: "/", icon: LayoutDashboard, group: "Overview" },

  { key: "leads", title: "Leads", url: "/leads", icon: Users, group: "Operations" },
  { key: "activations", title: "Clients", url: "/activations", icon: UserCheck, group: "Operations" },
  { key: "sources", title: "Sources", url: "/sources", icon: Tag, group: "Operations" },
  { key: "revenue", title: "Income", url: "/revenue", icon: TrendingUp, group: "Operations" },
  { key: "withdrawals", title: "Withdrawals", url: "/withdrawals", icon: Banknote, group: "Operations" },
  { key: "expenses", title: "Expenses", url: "/expenses", icon: Receipt, group: "Operations" },
  { key: "recurring", title: "Recurring", url: "/recurring", icon: Repeat, group: "Operations" },
  { key: "tasks", title: "Tasks", url: "/tasks", icon: ListTodo, group: "Operations" },
  { key: "import", title: "Import", url: "/import", icon: Upload, group: "Operations" },

  { key: "employees", title: "Employees", url: "/employees", icon: UserCog, group: "People" },
  { key: "performance", title: "Performance", url: "/performance", icon: Gauge, group: "People" },
  { key: "attendance", title: "Attendance", url: "/attendance", icon: CalendarCheck, group: "People" },

  { key: "reports", title: "Reports", url: "/reports", icon: FileBarChart, group: "Analytics" },
  { key: "affiliates", title: "Affiliates", url: "/affiliates", icon: Building2, group: "Analytics" },
  { key: "data-quality", title: "Data Quality", url: "/data-quality", icon: ShieldAlert, group: "Analytics" },

  { key: "users", title: "Users", url: "/users", icon: ShieldCheck, group: "Admin", adminOnly: true },
  { key: "permissions", title: "Permissions", url: "/users/permissions", icon: KeyRound, group: "Admin", adminOnly: true },
  { key: "settings", title: "Settings", url: "/settings", icon: Settings, group: "Admin", adminOnly: true },
  { key: "activity", title: "Audit Log", url: "/activity", icon: History, group: "Admin", adminOnly: true },
  { key: "logs", title: "Logs", url: "/logs", icon: ScrollText, group: "Admin", adminOnly: true },
  { key: "companies", title: "Companies", url: "/companies", icon: Landmark, group: "Admin", adminOnly: true, superAdminOnly: true },
];

export const MANAGEABLE_NAV_KEYS = NAV_ITEMS.filter((i) => !i.adminOnly).map((i) => i.key);
