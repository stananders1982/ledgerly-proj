/**
 * Quick-create plumbing.
 *
 * The floating speed dial navigates to a module page and asks it to open its
 * "new record" dialog immediately. We hand the intent over through
 * sessionStorage rather than a URL search param so each page can opt in
 * without changing its route search schema.
 */
import { useEffect } from "react";

const KEY = "ledgerly:quick-create";

export type QuickCreateKey =
  | "revenue"
  | "expenses"
  | "leads"
  | "activations"
  | "withdrawals"
  | "attendance"
  | "tasks";

export function requestQuickCreate(key: QuickCreateKey) {
  try {
    sessionStorage.setItem(KEY, key);
  } catch {
    /* storage unavailable — the page just opens normally */
  }
}

function consumeQuickCreate(key: QuickCreateKey) {
  try {
    if (sessionStorage.getItem(KEY) !== key) return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens a page's create dialog when the user arrived through the speed dial.
 * Call once near the top of the page component.
 */
export function useQuickCreate(key: QuickCreateKey, open: () => void) {
  useEffect(() => {
    if (consumeQuickCreate(key)) {
      // Let the page finish its first paint before the dialog mounts.
      const t = setTimeout(open, 60);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
