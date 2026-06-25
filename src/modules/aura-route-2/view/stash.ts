import type { MatchedRouteInfo, RouteInfo } from '../../aura-route-hooks/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraCacheStore, type CacheStoreOptions } from '../../aura-cache-store/core';
import type { ViewStashPort } from './ports';

type StashKeySource = MatchedRouteInfo | RouteInfo | undefined;

export function stashKey(source: StashKeySource, fallbackPath: string): string {
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

const DEFAULT_STASH_OPTIONS: CacheStoreOptions<ViewRoot> = {
  max: 10,
  gcTime: Infinity,
  gcSweepInterval: false,
  onRemove: (_key, root) => destroyViewRoot(root),
};

/** Shared LRU keep-alive stash. */
export class RouteViewStash implements ViewStashPort {
  private static store: AuraCacheStore<ViewRoot> | undefined;

  static configure(options: CacheStoreOptions<ViewRoot> = {}): void {
    RouteViewStash.store?.destroy();
    RouteViewStash.store = new AuraCacheStore({
      ...DEFAULT_STASH_OPTIONS,
      ...options,
      onRemove: options.onRemove ?? DEFAULT_STASH_OPTIONS.onRemove,
    });
  }

  extract(key: string): ViewRoot | undefined {
    return RouteViewStash.storeOf().extract(key);
  }

  put(key: string, root: ViewRoot): void {
    RouteViewStash.storeOf().set(key, root);
  }

  private static storeOf(): AuraCacheStore<ViewRoot> {
    if (!RouteViewStash.store) {
      RouteViewStash.configure();
    }
    return RouteViewStash.store!;
  }
}

export function destroyViewRoot(root: ViewRoot): void {
  root.replaceChildren();
  root.remove();
}

export const defaultViewStash = new RouteViewStash();
