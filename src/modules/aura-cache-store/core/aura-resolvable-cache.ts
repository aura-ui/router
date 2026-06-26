import { Singleflight } from '../../aura-utils/async/singleflight';
import { AuraCacheStore, type CacheStoreOptions } from './aura-cache-store';

/**
 * In-memory cache with LRU eviction and in-flight load deduplication.
 * Composes {@link AuraCacheStore} + {@link Singleflight} for `resolve(key, load)` flows.
 */
export class AuraResolvableCache<T> {
  private readonly store: AuraCacheStore<T>;
  private readonly singleflight = new Singleflight<string, unknown>();

  constructor(options: CacheStoreOptions<T> = {}) {
    this.store = new AuraCacheStore(options);
  }

  get(key: string): T | undefined {
    return this.store.get(key);
  }

  set(key: string, value: T): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
    this.singleflight.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.singleflight.clear();
  }

  destroy(): void {
    this.store.destroy();
    this.singleflight.clear();
  }

  /**
   * Returns a cached value or runs `load` once per in-flight key.
   * @param persist Custom write path; default writes the settled value with {@link set}.
   */
  resolve<R>(
    key: string,
    load: () => Promise<R>,
    persist?: (key: string, value: R) => void,
  ): Promise<R> {
    const cached = this.store.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached as unknown as R);
    }

    return this.singleflight.do(key, () =>
      load().then((value) => {
        if (persist) {
          persist(key, value);
        } else {
          this.store.set(key, value as unknown as T);
        }
        return value;
      }),
    ) as Promise<R>;
  }
}
