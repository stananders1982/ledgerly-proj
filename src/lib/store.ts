import { useSyncExternalStore } from "react";

export type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "won";

export interface Lead {
  id: string;
  source: string;
  date: string; // ISO
  cost: number;
  status: LeadStatus;
  activated: boolean;
  revenue: number;
}

export const EXPENSE_CATEGORIES = [
  "Marketing",
  "Rent",
  "Internet",
  "Utilities",
  "Salaries",
  "Commissions",
  "Software",
  "Travel",
  "Miscellaneous",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  note?: string;
}

export interface Revenue {
  id: string;
  date: string;
  customer: string;
  amount: number;
  employee: string;
  leadSource: string;
}

interface State {
  leads: Lead[];
  expenses: Expense[];
  revenues: Revenue[];
}

const KEY = "finance-dashboard-v1";

const seed = (): State => {
  const today = new Date();
  const d = (offset: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() - offset);
    return x.toISOString();
  };
  const sources = ["Google Ads", "Facebook", "Referral", "Cold Call", "LinkedIn"];
  const employees = ["Alex Carter", "Priya Shah", "Diego Martins", "Mei Lin"];
  const leads: Lead[] = Array.from({ length: 28 }).map((_, i) => ({
    id: crypto.randomUUID(),
    source: sources[i % sources.length],
    date: d(i),
    cost: 20 + Math.round(Math.random() * 80),
    status: (["new", "contacted", "qualified", "won", "lost"] as LeadStatus[])[i % 5],
    activated: i % 3 !== 0,
    revenue: i % 3 !== 0 ? 200 + Math.round(Math.random() * 2000) : 0,
  }));
  const expenses: Expense[] = Array.from({ length: 18 }).map((_, i) => ({
    id: crypto.randomUUID(),
    date: d(i),
    category: EXPENSE_CATEGORIES[i % EXPENSE_CATEGORIES.length],
    amount: 100 + Math.round(Math.random() * 2400),
    note: "",
  }));
  const revenues: Revenue[] = Array.from({ length: 22 }).map((_, i) => ({
    id: crypto.randomUUID(),
    date: d(i),
    customer: `Acme ${i + 1}`,
    amount: 300 + Math.round(Math.random() * 3000),
    employee: employees[i % employees.length],
    leadSource: sources[i % sources.length],
  }));
  return { leads, expenses, revenues };
};

let state: State = (() => {
  if (typeof window === "undefined") return { leads: [], expenses: [], revenues: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const s = seed();
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
  return s;
})();

const listeners = new Set<() => void>();
const emit = () => {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }
  listeners.forEach((l) => l());
};

export const store = {
  get: () => state,
  subscribe: (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  addLead: (l: Omit<Lead, "id">) => {
    state = { ...state, leads: [{ ...l, id: crypto.randomUUID() }, ...state.leads] };
    emit();
  },
  deleteLead: (id: string) => {
    state = { ...state, leads: state.leads.filter((x) => x.id !== id) };
    emit();
  },
  addExpense: (e: Omit<Expense, "id">) => {
    state = { ...state, expenses: [{ ...e, id: crypto.randomUUID() }, ...state.expenses] };
    emit();
  },
  deleteExpense: (id: string) => {
    state = { ...state, expenses: state.expenses.filter((x) => x.id !== id) };
    emit();
  },
  addRevenue: (r: Omit<Revenue, "id">) => {
    state = { ...state, revenues: [{ ...r, id: crypto.randomUUID() }, ...state.revenues] };
    emit();
  },
  deleteRevenue: (id: string) => {
    state = { ...state, revenues: state.revenues.filter((x) => x.id !== id) };
    emit();
  },
  reset: () => {
    state = seed();
    emit();
  },
};

const emptyState: State = { leads: [], expenses: [], revenues: [] };
export const useStore = () =>
  useSyncExternalStore(
    store.subscribe,
    () => state,
    () => emptyState,
  );

export const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
