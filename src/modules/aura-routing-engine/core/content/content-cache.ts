import { AuraResolvableCache, type CacheStoreOptions } from '../../../aura-cache-store/core';
import type { ViewPayload } from './types';

const DEFAULT_CACHE_OPTIONS: CacheStoreOptions<string> = {
  max: 50,
  gcTime: Infinity,
  gcSweepInterval: false,
};

/** Router-owned content cache with LRU eviction and in-flight deduplication. */
export class ContentCache {
  private readonly store: AuraResolvableCache<string>;

  constructor(options: CacheStoreOptions<string> = {}) {
    this.store = new AuraResolvableCache({
      ...DEFAULT_CACHE_OPTIONS,
      ...options,
    });
  }

  get(key: string): ViewPayload | undefined {
    return this.store.get(key);
  }

  set(key: string, payload: ViewPayload): void {
    if (typeof payload === 'string') {
      this.store.set(key, payload);
    }
  }

  delete(key: string): void {
    this.store.delete(key);
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
      if (typeof payload === 'string') {
        this.store.set(entryKey, payload);
      }
    });
  }
}
