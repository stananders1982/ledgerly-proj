/**
 * PostgREST returns at most 1000 rows per request. Aggregate pages (dashboard,
 * reports, attendance, activations) must read every matching row or their
 * totals silently go wrong once a table crosses that cap.
 *
 * `fetchAll` pages through a query builder until it is exhausted.
 */

const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // 50k rows safety valve

type RangeableBuilder<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>;
};

/**
 * @param makeQuery factory returning a fresh query builder each call — Supabase
 * builders are single-use, so a factory is required rather than one instance.
 */
export async function fetchAll<T>(makeQuery: () => RangeableBuilder<T>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
