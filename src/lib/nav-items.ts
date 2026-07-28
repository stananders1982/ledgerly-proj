import { LayoutDashboard, Users, UserCheck, Receipt, TrendingUp, UserCog, Repeat, Tag, FileBarChart, CalendarCheck, ShieldCheck, Banknote, Gauge, Building2 } from "lucide-react";

export type NavItem = {
  key: string;
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", title: "Dashboard", url: "/", icon: LayoutDashboard },
  { key: "leads", title: "Leads", url: "/leads", icon: Users },
  { key: "activations", title: "Clients", url: "/activations", icon: UserCheck },

  { key: "sources", title: "Sources", url: "/sources", icon: Tag },
  { key: "revenue", title: "Income", url: "/revenue", icon: TrendingUp },
  { key: "withdrawals", title: "Withdrawals", url: "/withdrawals", icon: Banknote },
  { key: "expenses", title: "Expenses", url: "/expenses", icon: Receipt },
  { key: "recurring", title: "Recurring", url: "/recurring", icon: Repeat },
  { key: "employees", title: "Employees", url: "/employees", icon: UserCog },
  { key: "performance", title: "Performance", url: "/performance", icon: Gauge },
  { key: "attendance", title: "Attendance", url: "/attendance", icon: CalendarCheck },
  { key: "reports", title: "Reports", url: "/reports", icon: FileBarChart },
  { key: "affiliates", title: "Affiliates", url: "/affiliates", icon: Building2 },
  { key: "users", title: "Users", url: "/users", icon: ShieldCheck, adminOnly: true },
];

export const MANAGEABLE_NAV_KEYS = NAV_ITEMS.filter((i) => !i.adminOnly).map((i) => i.key);
