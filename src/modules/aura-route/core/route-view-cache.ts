import type { MatchedRouteInfo, RouteInfo } from '../../aura-route-hooks/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraCacheStore, type CacheStoreOptions } from '../../aura-cache-store/core';

export type ViewCacheRouteRef = Pick<RouteInfo, 'path' | 'query'>;

export type ViewCacheRouteSource = ViewCacheRouteRef | MatchedRouteInfo | undefined;

export interface RouteViewCachePort {
  /** Returns whether a readable entry exists (non-destructive; does not extract). */
  has(key: string): boolean;
  /** Returns the cached view and removes the entry (full extract, not a peek). */
  extract(key: string): ViewRoot | undefined;
  put(key: string, root: ViewRoot): void;
}

const DEFAULT_OPTIONS: CacheStoreOptions<ViewRoot> = {
  max: 10,
  gcTime: Infinity,
  gcSweepInterval: false,
  invalidatePolicy: 'remove',
  onRemove: (_key, root) => RouteViewCache.destroyViewRoot(root),
};

/**
 * LRU cache for keep-alive route views (`detach` → put → extract → reattach).
 *
 * One shared store per app — configure via {@link RouteViewCache.configure}.
 */
export class RouteViewCache implements RouteViewCachePort {
  private static store: AuraCacheStore<ViewRoot> | undefined;

  /** Normalizes {@link MatchedRouteInfo} / {@link RouteInfo} into a cache key ref. */
  static toRouteRef(route: ViewCacheRouteSource): ViewCacheRouteRef | undefined {
    if (!route) return undefined;

    if ('pathname' in route) {
      return {
        path: route.pathname,
        ...(route.query && { query: route.query }),
      };
    }

    return route;
  }

  /**
   * Stable keep-alive key for a route view instance.
   *
   * Base segment: `path` (pathname) → `fallbackPath` (route attr). Params are omitted —
   * they are always consistent with `path` on {@link RouteInfo}.
   */
  static buildKey(route: ViewCacheRouteSource, fallbackPath: string): string {
    const ref = RouteViewCache.toRouteRef(route);
    const base = ref?.path ?? fallbackPath;
    const parts = [base];

    if (ref?.query && Object.keys(ref.query).length > 0) {
      parts.push(RouteViewCache.serializeRecord(ref.query));
    }

    return parts.join('|');
  }

  /** Replaces the shared store (e.g. from `AuraRouter.configure({ viewCache })`). */
  static configure(options: CacheStoreOptions<ViewRoot> = {}): void {
    RouteViewCache.store?.destroy();
    RouteViewCache.store = new AuraCacheStore({
      ...DEFAULT_OPTIONS,
      ...options,
      onRemove: options.onRemove ?? DEFAULT_OPTIONS.onRemove,
    });
  }

  /** Snapshot of stash keys for devtools / debugging. */
  static keys(): string[] {
    return RouteViewCache.getStore().keys();
  }

  has(key: string): boolean {
    return RouteViewCache.getStore().has(key);
  }

  /** Returns the cached view and removes the entry (full extract, not a peek). */
  extract(key: string): ViewRoot | undefined {
    return RouteViewCache.getStore().extract(key);
  }

  put(key: string, root: ViewRoot): void {
    RouteViewCache.getStore().set(key, root);
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
