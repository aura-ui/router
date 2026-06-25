import type { ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import { AuraCacheStore, type CacheStoreOptions } from '../../../aura-cache-store/core';

/** Minimal stash port used by {@link AuraRouteViewController} (`detach` → put → extract → reattach). */
export interface RouteViewCachePort {
  /** Checkout: removes entry from stash; GC-expired entries run `onRemove` first. */
  extract(key: string): ViewRoot | undefined;
  put(key: string, root: ViewRoot): void;
}

const DEFAULT_OPTIONS: CacheStoreOptions<ViewRoot> = {
  max: 10,
  gcTime: Infinity,
  gcSweepInterval: false,
  onRemove: (_key, root) => RouteViewCache.destroyViewRoot(root),
};

/** Shared LRU stash for keep-alive views. */
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

  static destroyViewRoot(root: ViewRoot): void {
    root.replaceChildren();
    root.remove();
  }
}

export const defaultRouteViewCache = new RouteViewCache();
