import type { DomCachePort } from '../../core/view/types';

/** Map-backed {@link DomCachePort} for keep-alive tests. */
export function createMockDomCache(
  stash: Map<string, Element> = new Map(),
): DomCachePort {
  return {
    has: (key) => stash.has(key),
    extract: (key) => {
      const root = stash.get(key);
      if (root) stash.delete(key);
      return root as HTMLElement;
    },
    put: (key, root) => {
      stash.set(key, root);
    },
  };
}

/** No-op DomCache (`has` always false, `extract` always miss). */
export function createNoopDomCache(): DomCachePort {
  return {
    has: () => false,
    extract: () => undefined,
    put: () => {},
  };
}
