/**
 * Execute async tasks in parallel with a concurrency limit.
 * Like Promise.all but with a max number of simultaneous tasks.
 *
 * @param items - Items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Max parallel executions (default 5)
 * @returns Results in same order as items
 */
export async function parallelLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}
