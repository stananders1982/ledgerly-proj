/**
 * Global quick-create speed dial.
 *
 * Always reachable, bottom-right, on every authenticated page. Options are
 * filtered by the same nav permissions that drive the sidebar, so a user only
 * ever sees shortcuts to modules they can actually open.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  CalendarCheck,
  ListTodo,
  Plus,
  Receipt,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { requestQuickCreate, type QuickCreateKey } from "@/lib/quick-create";

type Option = {
  key: QuickCreateKey;
  navKey: string;
  label: string;
  to: string;
  icon: typeof Plus;
  tone: string;
};

const OPTIONS: Option[] = [
  { key: "revenue", navKey: "revenue", label: "Income", to: "/revenue", icon: TrendingUp, tone: "text-emerald-600 dark:text-emerald-400" },
  { key: "expenses", navKey: "expenses", label: "Expense", to: "/expenses", icon: Receipt, tone: "text-rose-600 dark:text-rose-400" },
  { key: "leads", navKey: "leads", label: "Lead entry", to: "/leads", icon: Users, tone: "text-sky-600 dark:text-sky-400" },
  { key: "withdrawals", navKey: "withdrawals", label: "Withdrawal", to: "/withdrawals", icon: Banknote, tone: "text-amber-600 dark:text-amber-400" },
  { key: "tasks", navKey: "tasks", label: "Task", to: "/tasks", icon: ListTodo, tone: "text-teal-600 dark:text-teal-400" },
  { key: "activations", navKey: "activations", label: "Clients", to: "/activations", icon: UserCheck, tone: "text-fuchsia-600 dark:text-fuchsia-400" },
  { key: "attendance", navKey: "attendance", label: "Attendance", to: "/attendance", icon: CalendarCheck, tone: "text-indigo-600 dark:text-indigo-400" },
];

export function QuickCreate() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isAdmin, navKeys, permsLoaded } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const allowed = OPTIONS.filter((o) => (isAdmin ? true : permsLoaded && navKeys.has(o.navKey)));
  if (allowed.length === 0) return null;

  const pick = (o: Option) => {
    setOpen(false);
    requestQuickCreate(o.key);
    navigate({ to: o.to });
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {open &&
          allowed.map((o, i) => (
            <button
              key={o.key}
              onClick={() => pick(o)}
              style={{ animationDelay: `${i * 25}ms` }}
              className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-lg transition-colors hover:bg-accent"
            >
              <o.icon className={cn("h-4 w-4", o.tone)} />
              {o.label}
            </button>
          ))}
        <Button
          size="icon"
          onClick={() => setOpen((v) => !v)}
          title="Quick create (C)"
          aria-label="Quick create"
          className="h-12 w-12 rounded-full shadow-xl"
        >
          {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </Button>
      </div>
    </>
  );
}
