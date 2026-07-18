/**
 * Runs async work over `items` with a bounded worker pool.
 * Workers share a queue; at most `concurrency` tasks run in parallel.
 */
export async function runConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<void> {
  if (items.length === 0 || signal?.aborted) return;

  const limit = Math.max(1, concurrency);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      if (signal?.aborted) return;

      const index = nextIndex++;
      const item = items[index];
      if (item === undefined) return;

      await run(item);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}
