import type { RouteInfo } from '../../aura-route-hooks/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraCacheStore, type CacheStoreOptions } from '../../aura-cache-store/core';

export type ViewCacheRouteRef = Pick<RouteInfo, 'path' | 'params' | 'query'>;

export interface RouteViewCachePort {
  /** Returns the cached view and removes the entry (full extract, not a peek). */
  extract(key: string): ViewRoot | undefined;
  put(key: string, root: ViewRoot): void;
}

const DEFAULT_OPTIONS: CacheStoreOptions<ViewRoot> = {
  max: 10,
  gcTime: Infinity,
  gcSweepInterval: false,
  invalidatePolicy: 'remove',
  onEvict: (_key, root) => RouteViewCache.destroyViewRoot(root),
};

/**
 * LRU cache for keep-alive route views (`detach` → put → take → reattach).
 *
 * One shared store per app — configure via {@link RouteViewCache.configure}.
 */
export class RouteViewCache implements RouteViewCachePort {
  private static store: AuraCacheStore<ViewRoot> | undefined;

  /**
   * Stable keep-alive key for a route view instance.
   *
   * Base segment: `routePath` (tree full path) → `path` (pathname) → `fallbackPath` (route attr).
   * Callers that put and take must use the same base — lifecycle `RouteInfo` includes
   * `routePath` from the matcher so `onReenter` keys match `render` / `onLeft`.
   */
  static buildKey(route: ViewCacheRouteRef | undefined, fallbackPath: string): string {
    const base = route?.path ?? fallbackPath;
    const parts = [base];

    if (route?.params && Object.keys(route.params).length > 0) {
      parts.push(RouteViewCache.serializeRecord(route.params));
    }

    if (route?.query && Object.keys(route.query).length > 0) {
      parts.push(RouteViewCache.serializeRecord(route.query));
    }

    return parts.join('|');
  }

  /** Replaces the shared store (e.g. from `AuraRouter.configure({ viewCache })`). */
  static configure(options: CacheStoreOptions<ViewRoot> = {}): void {
    RouteViewCache.store?.destroy();
    RouteViewCache.store = new AuraCacheStore({
      ...DEFAULT_OPTIONS,
      ...options,
      onEvict: options.onEvict ?? DEFAULT_OPTIONS.onEvict,
    });
  }

  /** Returns the cached view and removes the entry (full extract, not a peek). */
  extract(key: string): ViewRoot | undefined {
    return RouteViewCache.getStore().extract(key);
  }

  put(key: string, root: ViewRoot): void {
    const store = RouteViewCache.getStore();
    if (store.has(key)) {
      store.delete(key);
    }
    store.set(key, root);
  }

  private static getStore(): AuraCacheStore<ViewRoot> {
    if (!RouteViewCache.store) {
      RouteViewCache.configure();
    }
    return RouteViewCache.store!;
  }

  private static serializeRecord(record: Record<string, string>): string {
    return Object.keys(record)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(record[key]!)}`)
      .join('&');
  }

  static destroyViewRoot(root: ViewRoot): void {
    root.replaceChildren();
    root.remove();
  }
}

export const defaultRouteViewCache = new RouteViewCache();
