import { Singleflight } from '../../aura-utils/async/singleflight';
import { AuraCacheStore, type CacheStoreOptions, type InvalidatePolicy } from './aura-cache-store';

/**
 * In-memory cache with LRU eviction, in-flight load deduplication, and SWR resolve.
 * Composes {@link AuraCacheStore} + {@link Singleflight} for `resolve(key, load)` flows.
 *
 * When {@link CacheStoreOptions.staleTime} is set, stale entries are returned immediately
 * and `load` runs in the background (stale-while-revalidate).
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

  invalidate(key: string, policy?: InvalidatePolicy): boolean {
    return this.store.invalidate(key, policy);
  }

  invalidateMatch(
    predicate: (key: string) => boolean,
    policy?: InvalidatePolicy,
  ): number {
    return this.store.invalidateMatch(predicate, policy);
  }

  invalidateAll(policy?: InvalidatePolicy): number {
    return this.store.invalidateAll(policy);
  }

  destroy(): void {
    this.store.destroy();
    this.singleflight.clear();
  }

  /**
   * Returns a cached value or runs `load` once per in-flight key.
   *
   * With SWR (`staleTime`): fresh → cached value; stale → cached value + background `load`;
   * missing → await `load`. Background revalidation errors are ignored.
   *
   * @param persist Custom write path; default writes the settled value with {@link set}.
   */
  resolve<R>(
    key: string,
    load: () => Promise<R>,
    persist?: (key: string, value: R) => void,
  ): Promise<R> {
    const entry = this.store.lookup(key, true);

    if (entry.status === 'fresh') {
      return Promise.resolve(entry.value as unknown as R);
    }

    if (entry.status === 'stale') {
      void this.runLoad(key, load, persist).catch(() => {});
      return Promise.resolve(entry.value as unknown as R);
    }

    return this.runLoad(key, load, persist) as Promise<R>;
  }

  private runLoad<R>(
    key: string,
    load: () => Promise<R>,
    persist?: (key: string, value: R) => void,
  ): Promise<R> {
    return this.singleflight.do(key, () =>
      load().then((value) => {
        this.commit(key, value, persist);
        return value;
      }),
    ) as Promise<R>;
  }

  private commit<R>(key: string, value: R, persist?: (key: string, value: R) => void): void {
    if (persist) {
      persist(key, value);
    } else {
      this.store.set(key, value as unknown as T);
    }
  }
}
