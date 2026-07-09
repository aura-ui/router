import {
  AuraResolvableCache,
  type CacheStoreOptions,
} from '../../../../aura-cache-store/core';
import {
  invalidateRouterCache,
  type RouterInvalidateOptions,
} from '../../invalidate-router-cache';
import type { ViewPayload } from '../types';

/** Default view-loader payload TTL — 12 hours. */
export const VIEW_PAYLOAD_CACHE_GC_TIME = 12 * 60 * 60 * 1000;

const DEFAULT_OPTIONS: CacheStoreOptions<string> = {
  max: 50,
  gcTime: VIEW_PAYLOAD_CACHE_GC_TIME,
};

/**
 * String payload cache for `cache.view` routes.
 * Detached DOM uses aura-route {@link RouteDomCache}, not this store.
 */
export class ViewPayloadCache {
  private readonly store: AuraResolvableCache<string>;

  constructor(options: CacheStoreOptions<string> = {}) {
    this.store = new AuraResolvableCache({ ...DEFAULT_OPTIONS, ...options });
  }

  get(key: string): ViewPayload | undefined {
    return this.store.get(key);
  }

  clear(): void {
    this.store.clear();
  }

  destroy(): void {
    this.store.destroy();
  }

  /**
   * Dedup in-flight loads; persist only **string** payloads (`html` / `markup`).
   * `DocumentFragment` results are not written to the store.
   */
  resolve(
    key: string,
    load: () => Promise<ViewPayload | null>,
  ): Promise<ViewPayload | null> {
    return this.store.resolve(key, load, (entryKey, payload) => {
      typeof payload === 'string' && this.store.set(entryKey, payload);
    });
  }

  invalidate(options: RouterInvalidateOptions = {}): number {
    return invalidateRouterCache(this.store, options, 'stale');
  }
}
