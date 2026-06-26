import { AuraResolvableCache, type CacheStoreOptions } from '../../../aura-cache-store/core';
import type { ViewPayload } from '../view/ports';

const DEFAULT_CACHE_OPTIONS: CacheStoreOptions<string> = {
  max: 50,
  gcTime: Infinity,
  gcSweepInterval: false,
};

/** In-memory content cache with LRU eviction and in-flight deduplication. */
export class ContentCache {
  private static cache: AuraResolvableCache<string> | undefined;

  static configure(options: CacheStoreOptions<string> = {}): void {
    ContentCache.cache?.destroy();
    ContentCache.cache = new AuraResolvableCache({
      ...DEFAULT_CACHE_OPTIONS,
      ...options,
    });
  }

  get(key: string): ViewPayload | undefined {
    return ContentCache.cacheOf().get(key);
  }

  set(key: string, payload: ViewPayload): void {
    if (typeof payload === 'string') {
      ContentCache.cacheOf().set(key, payload);
    }
  }

  delete(key: string): void {
    ContentCache.cacheOf().delete(key);
  }

  clear(): void {
    ContentCache.cacheOf().clear();
  }

  resolve(
    key: string,
    load: () => Promise<ViewPayload | null>,
  ): Promise<ViewPayload | null> {
    const cache = ContentCache.cacheOf();
    return cache.resolve(key, load, (entryKey, payload) => {
      if (typeof payload === 'string') {
        cache.set(entryKey, payload);
      }
    });
  }

  private static cacheOf(): AuraResolvableCache<string> {
    if (!ContentCache.cache) {
      ContentCache.configure();
    }
    return ContentCache.cache!;
  }
}

export const defaultContentCache = new ContentCache();
