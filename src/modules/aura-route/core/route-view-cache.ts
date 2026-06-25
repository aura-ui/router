import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraCacheStore, type CacheStoreOptions } from '../../aura-cache-store/core';

/** String-key stash for detached keep-alive views. Key shape: see `view-cache-key`. */
export interface RouteViewCachePort {
  /** Returns whether a readable entry exists (may remove GC-expired entries). */
  has(key: string): boolean;
  /** Returns a cached view without extracting or promoting LRU (may remove GC-expired entries). */
  peek(key: string): ViewRoot | undefined;
  /** Checkout: live entry without `onRemove`; GC-expired runs `onRemove` first. */
  extract(key: string): ViewRoot | undefined;
  put(key: string, root: ViewRoot): void;
  /** Removes one entry and invokes `onRemove`. */
  delete(key: string): boolean;
  /** Removes entries matching `predicate` and invokes `onRemove` for each. */
  invalidateMatch(predicate: (key: string) => boolean): number;
}

const DEFAULT_OPTIONS: CacheStoreOptions<ViewRoot> = {
  max: 10,
  gcTime: Infinity,
  gcSweepInterval: false,
  invalidatePolicy: 'remove',
  onRemove: (_key, root) => RouteViewCache.destroyViewRoot(root),
};

/** Shared LRU stash for keep-alive views (`detach` → put → extract → reattach). */
export class RouteViewCache implements RouteViewCachePort {
  private static store: AuraCacheStore<ViewRoot> | undefined;

  static configure(options: CacheStoreOptions<ViewRoot> = {}): void {
    RouteViewCache.store?.destroy();
    RouteViewCache.store = new AuraCacheStore({
      ...DEFAULT_OPTIONS,
      ...options,
      onRemove: options.onRemove ?? DEFAULT_OPTIONS.onRemove,
    });
  }

  static keys(): string[] {
    return RouteViewCache.getStore().keys();
  }

  has(key: string): boolean {
    return RouteViewCache.getStore().has(key);
  }

  peek(key: string): ViewRoot | undefined {
    return RouteViewCache.getStore().peek(key);
  }

  extract(key: string): ViewRoot | undefined {
    return RouteViewCache.getStore().extract(key);
  }

  put(key: string, root: ViewRoot): void {
    RouteViewCache.getStore().set(key, root);
  }

  delete(key: string): boolean {
    return RouteViewCache.getStore().delete(key);
  }

  invalidateMatch(predicate: (key: string) => boolean): number {
    return RouteViewCache.getStore().invalidateMatch(predicate, 'remove');
  }

  private static getStore(): AuraCacheStore<ViewRoot> {
    if (!RouteViewCache.store) {
      RouteViewCache.configure();
    }
    return RouteViewCache.store!;
  }

  static destroyViewRoot(root: ViewRoot): void {
    root.replaceChildren();
    root.remove();
  }
}

export const defaultRouteViewCache = new RouteViewCache();
