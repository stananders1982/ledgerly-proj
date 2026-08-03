let displayCurrency = "USD";

/** Set the workspace display currency (called once company settings load). */
export const setDisplayCurrency = (code: string) => {
  displayCurrency = code || "USD";
};

export const getDisplayCurrency = () => displayCurrency;

export const fmtMoney = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: displayCurrency,
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
