import { useSyncExternalStore } from "react";

let displayCurrency = "USD";
// Legacy workspace-denominated values (salaries, source prices, recurring
// costs, and rows without an explicit currency) were entered in USD. Keep
// their accounting denomination stable when the user changes display currency.
const workspaceAccountingCurrency = "USD";
const OVERRIDE_KEY = "display-currency-override";
let currencyOverride: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem(OVERRIDE_KEY) : null;

const currencyListeners = new Set<() => void>();
const notifyCurrency = () => currencyListeners.forEach((l) => l());

/** Set the workspace display currency (called once company settings load). */
export const setDisplayCurrency = (code: string) => {
  displayCurrency = code || "USD";
  notifyCurrency();
};

/** Session-persisted user override of the display currency (e.g. dashboard selector). */
export const setCurrencyOverride = (code: string | null) => {
  currencyOverride = code || null;
  try {
    if (currencyOverride) window.localStorage.setItem(OVERRIDE_KEY, currencyOverride);
    else window.localStorage.removeItem(OVERRIDE_KEY);
  } catch { /* private mode */ }
  notifyCurrency();
};

export const getCurrencyOverride = () => currencyOverride;

/** Currency used by workspace-denominated values and legacy NULL-currency rows. */
export const getWorkspaceCurrency = () => workspaceAccountingCurrency;

export const getDisplayCurrency = () => currencyOverride ?? displayCurrency;

/** Reactive display currency — re-renders when the workspace or override changes. */
export function useDisplayCurrency() {
  return useSyncExternalStore(
    (cb) => { currencyListeners.add(cb); return () => currencyListeners.delete(cb); },
    getDisplayCurrency,
    getDisplayCurrency,
  );
}

export const fmtMoney = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: getDisplayCurrency(),
    maximumFractionDigits: 0,
  });

export const fmtPct = (n: number | null | undefined, digits = 1) =>
  `${(Number(n) || 0).toFixed(digits)}%`;

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString();
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
