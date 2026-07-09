import type { MatchedRouteInfo } from '../match/url-matcher';

export type ContentPrefetchOptions = {
  readonly concurrency?: number;
  readonly order?: 'leaf-first' | 'root-first';
};

const DEFAULT_PREFETCH: Required<ContentPrefetchOptions> = {
  concurrency: 3,
  order: 'root-first',
};

export async function prefetchConcurrent(
  items: readonly MatchedRouteInfo[],
  concurrency: number,
  run: (item: MatchedRouteInfo) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const limit = Math.max(1, concurrency);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await run(items[index]!);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

export function orderPrefetchChain<T>(
  chain: readonly T[],
  order: ContentPrefetchOptions['order'],
): readonly T[] {
  return order === 'leaf-first' ? [...chain].reverse() : chain;
}

export { DEFAULT_PREFETCH };
