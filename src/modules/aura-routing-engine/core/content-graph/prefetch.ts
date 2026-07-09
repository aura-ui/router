export type ContentPrefetchOptions = {
  readonly concurrency?: number;
  readonly order?: 'leaf-first' | 'root-first';
};

export const DEFAULT_PREFETCH: Required<ContentPrefetchOptions> = {
  concurrency: 3,
  order: 'root-first',
};

/**
 * Reorders a matched chain for prefetch scheduling.
 * `root-first` keeps root → leaf; `leaf-first` schedules leaf before parents.
 */
export function orderPrefetchChain<T>(
  chain: readonly T[],
  order: ContentPrefetchOptions['order'] = DEFAULT_PREFETCH.order,
): readonly T[] {
  return order === 'leaf-first' ? [...chain].reverse() : chain;
}

/**
 * Runs async work over `items` with a bounded worker pool.
 *
 * `order` only affects dequeue priority — with `concurrency > 1`, items still
 * overlap. Strict sequencing requires `concurrency: 1`.
 */
export async function runConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
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
