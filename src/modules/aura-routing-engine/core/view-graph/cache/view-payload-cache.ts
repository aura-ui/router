import {
  AuraResolvableCache,
  type CacheStoreOptions,
  type ResolvableCacheOptions,
} from '../../../../aura-cache-store/core';
import {
  invalidateRouterCache,
  type RouterInvalidateOptions,
} from '../../invalidate-router-cache';
import type { ViewPayload } from '../types';

/** Default view-loader payload TTL — 12 hours. */
export const VIEW_PAYLOAD_CACHE_GC_TIME = 12 * 60 * 60 * 1000;

const DEFAULT_OPTIONS: ResolvableCacheOptions<string> = {
  max: 50,
  gcTime: VIEW_PAYLOAD_CACHE_GC_TIME,
  /** Persist only string payloads (`html` / `markup`); skip DocumentFragment. */
  write: (payload) => typeof payload === 'string',
};

/**
 * String payload cache for `cache.view` routes.
 * Detached DOM uses aura-route {@link RouteDomCache}, not this store.
 */
export class ViewPayloadCache {
  private readonly store: AuraResolvableCache<string>;

  constructor(options: CacheStoreOptions<string> = {}) {
    this.store = new AuraResolvableCache({
      ...DEFAULT_OPTIONS,
      ...options,
      // Always filter DOM fragments — callers must not override away.
      write: DEFAULT_OPTIONS.write,
    });
  }

  get(key: string): ViewPayload | undefined {
    return this.store.get(key);
  }

  /**
   * Persist a settled payload. Same write filter as {@link resolve}
   * (string only; `DocumentFragment` is skipped).
   */
  set(key: string, payload: ViewPayload): void {
    if (typeof payload === 'string') {
      this.store.set(key, payload);
    }
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
    return this.store.resolve(key, load);
  }

  invalidate(options: RouterInvalidateOptions = {}): number {
    return invalidateRouterCache(this.store, options, 'stale');
  }
}
