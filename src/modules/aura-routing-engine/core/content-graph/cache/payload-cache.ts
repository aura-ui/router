import {
  AuraResolvableCache,
  type CacheStoreOptions,
} from '../../../../aura-cache-store/core';
import {
  invalidateRouterCache,
  type RouterInvalidateOptions,
} from '../../invalidate-router-cache';
import type { ViewPayload } from '../types';

const DEFAULT_OPTIONS: CacheStoreOptions<string> = {
  max: 50,
  gcTime: Infinity,
  gcSweepInterval: false,
};

function isCacheable(payload: ViewPayload | null): payload is string {
  return typeof payload === 'string';
}

/** View-loader string payload cache with in-flight deduplication. */
export class PayloadCache {
  private readonly store: AuraResolvableCache<string>;

  constructor(options: CacheStoreOptions<string> = {}) {
    this.store = new AuraResolvableCache({
      ...DEFAULT_OPTIONS,
      ...options,
    });
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

  resolve(
    key: string,
    load: () => Promise<ViewPayload | null>,
  ): Promise<ViewPayload | null> {
    return this.store.resolve(key, load, (entryKey, payload) => {
      if (isCacheable(payload)) {
        this.store.set(entryKey, payload);
      }
    });
  }

  invalidate(options: RouterInvalidateOptions = {}): number {
    return invalidateRouterCache(this.store, options, 'stale');
  }
}
