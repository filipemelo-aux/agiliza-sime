type PageResult<T> = { data: T[] | null; error: { message: string } | null };

const PAGE_SIZE = 1000;
/** Pages requested at once after the first full page — fewer round-trips, bounded load. */
const PARALLEL_PAGES = 3;

/** Read every page without treating a failed query as an empty result. */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  const read = async (index: number) => {
    const from = index * PAGE_SIZE;
    const result = await fetchPage(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  };

  const first = await read(0);
  rows.push(...first);
  if (first.length < PAGE_SIZE) return { data: rows, error: null };

  for (let next = 1; ; next += PARALLEL_PAGES) {
    const pages = await Promise.all(Array.from({ length: PARALLEL_PAGES }, (_, i) => read(next + i)));
    for (const page of pages) {
      rows.push(...page);
      if (page.length < PAGE_SIZE) return { data: rows, error: null };
    }
  }
}
