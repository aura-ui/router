import type { MatchedRouteInfo, RouteInfo } from '../../../aura-route-hooks/core';
import type { ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import { AuraCacheStore, type CacheStoreOptions } from '../../../aura-cache-store/core';
import type { ViewCachePort } from './ports';

type CacheKeySource = MatchedRouteInfo | RouteInfo | undefined;

export function cacheKey(source: CacheKeySource, fallbackPath: string): string {
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

/** Shared LRU keep-alive view cache. */
export class RouteViewCache implements ViewCachePort {
  private static store: AuraCacheStore<ViewRoot> | undefined;

  static configure(options: CacheStoreOptions<ViewRoot> = {}): void {
    RouteViewCache.store?.destroy();
    RouteViewCache.store = new AuraCacheStore({
      ...DEFAULT_CACHE_OPTIONS,
      ...options,
      onRemove: options.onRemove ?? DEFAULT_CACHE_OPTIONS.onRemove,
    });
  }

  extract(key: string): ViewRoot | undefined {
    return RouteViewCache.storeOf().extract(key);
  }

  put(key: string, root: ViewRoot): void {
    RouteViewCache.storeOf().set(key, root);
  }

  private static storeOf(): AuraCacheStore<ViewRoot> {
    if (!RouteViewCache.store) {
      RouteViewCache.configure();
    }
    return RouteViewCache.store!;
  }
}

export function destroyViewRoot(root: ViewRoot): void {
  root.replaceChildren();
  root.remove();
}

export const defaultViewCache = new RouteViewCache();
