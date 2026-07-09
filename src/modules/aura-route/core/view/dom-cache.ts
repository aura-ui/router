import { AuraCacheStore, type CacheStoreOptions } from '../../../aura-cache-store/core';
import type { ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo, RouteInfo } from '../../../aura-routing-engine/route-api';

import type { DomCachePort } from './types';

type CacheKeySource = MatchedRouteInfo | RouteInfo | undefined;

/** Cache key for detached DOM (`cache.dom`). */
export function domCacheKey(source: CacheKeySource, fallbackPath: string): string {
  const base = source?.pathname ?? fallbackPath;
  const query = source?.query;

  if (!query || Object.keys(query).length === 0) {
    return base;
  }

  const qs = Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key]!)}`)
    .join('&');

  return `${base}|${qs}`;
}

const DEFAULT_CACHE_OPTIONS: CacheStoreOptions<ViewRoot> = {
  max: 10,
  gcTime: Infinity,
  gcSweepInterval: false,
  onRemove: (_key, root) => destroyViewRoot(root),
};

/** Shared LRU detached-DOM cache (`cache.dom`). */
export class RouteDomCache implements DomCachePort {
  private static store: AuraCacheStore<ViewRoot> | undefined;

  static configure(options: CacheStoreOptions<ViewRoot> = {}): void {
    RouteDomCache.store?.destroy();
    RouteDomCache.store = new AuraCacheStore({
      ...DEFAULT_CACHE_OPTIONS,
      ...options,
      onRemove: options.onRemove ?? DEFAULT_CACHE_OPTIONS.onRemove,
    });
  }

  extract(key: string): ViewRoot | undefined {
    return RouteDomCache.storeOf().extract(key);
  }

  put(key: string, root: ViewRoot): void {
    RouteDomCache.storeOf().set(key, root);
  }

  private static storeOf(): AuraCacheStore<ViewRoot> {
    if (!RouteDomCache.store) {
      RouteDomCache.configure();
    }
    return RouteDomCache.store!;
  }
}

export function destroyViewRoot(root: ViewRoot): void {
  root.replaceChildren();
  root.remove();
}

export const defaultDomCache = new RouteDomCache();
