import { useEffect, useState } from "react";

/**
 * useState that remembers its value in localStorage, so a page keeps the
 * filters/date range the user last picked instead of resetting on every visit.
 * SSR-safe: the initial render always uses `initial`, then hydrates.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const storageKey = `pref:${key}`;
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [storageKey, value, hydrated]);

  return [value, setValue] as const;
}
