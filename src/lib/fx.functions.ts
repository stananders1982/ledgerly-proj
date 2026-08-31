import { createServerFn } from "@tanstack/react-start";
import { loadFxRates } from "@/lib/fx.server";

/**
 * Live FX rates, keyed per base currency:
 * `rates["USD"]["AUD"]` = value of 1 AUD in USD.
 */
export const getFxRates = createServerFn({ method: "GET" }).handler(async () => {
  return loadFxRates();
});
