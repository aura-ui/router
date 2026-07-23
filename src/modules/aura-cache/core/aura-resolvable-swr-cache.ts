import { Singleflight } from '../../aura-utils/async/singleflight';

import { AuraSwrCache, type SwrCacheOptions, type InvalidatePolicy } from './aura-swr-cache';

/**
 * Resolve policy for {@link AuraResolvableSwrCache} — fixed at construction, not per `resolve` call.
 *
 * Avoids concurrent `resolve` callers disagreeing on write / side-effects for the same key.
 */
export type ResolvableSwrCachePolicy = {
  /**
   * Whether to write the settled value into this store.
   * Default `true`. Pass `false` or a predicate to skip / filter storage
   * (in-flight dedupe still applies).
   */
  readonly write?: boolean | ((value: unknown) => boolean);
  /**
   * Extra side-effect after a successful load settle; does not replace {@link write}.
   * Not called on fresh cache hits.
   */
  readonly onSettled?: (key: string, value: unknown) => void;
};

/** Constructor options: store config + fixed resolve policy. */
export type ResolvableSwrCacheOptions<T> = SwrCacheOptions<T> & ResolvableSwrCachePolicy;

/**
 * In-memory cache with LRU eviction, in-flight load deduplication, and SWR resolve.
 * Composes {@link AuraSwrCache} + {@link Singleflight} for `resolve(key, load)` flows.
 *
 * When {@link SwrCacheOptions.staleTime} is set, stale entries are returned immediately
 * and `load` runs in the background (stale-while-revalidate).
 */
export class AuraResolvableSwrCache<T> {
  private readonly store: AuraSwrCache<T>;
  private readonly singleflight = new Singleflight<string, unknown>();
  private readonly write: ResolvableSwrCachePolicy['write'];
  private readonly onSettled: ResolvableSwrCachePolicy['onSettled'];
  /**
   * Bumped on {@link clear} / {@link destroy} so in-flight loads started before the bump
   * cannot {@link commit} into a cleared store (orphan singleflight after map clear).
   */
  private epoch = 0;

  constructor(options: ResolvableSwrCacheOptions<T> = {}) {
    const { write, onSettled, ...storeOptions } = options;
    this.store = new AuraSwrCache(storeOptions);
    this.write = write;
    this.onSettled = onSettled;
  }

  get(key: string): T | undefined {
    return this.store.get(key);
  }

  /** Read-only probe — no LRU promote, no load. */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Join in-flight `resolve` work or a settled store value — never starts a load.
   *
   * @returns Promise of the value when in-flight or settled; `undefined` when missing.
   */
  join(key: string): Promise<T> | undefined {
    const pending = this.singleflight.get(key);
    if (pending) return pending as Promise<T>;

    const settled = this.store.get(key);
    if (settled !== undefined) return Promise.resolve(settled);

    return undefined;
  }

  set(key: string, value: T): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
    this.singleflight.delete(key);
  }

  clear(): void {
    this.epoch++;
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
    this.epoch++;
    this.store.destroy();
    this.singleflight.clear();
  }

  /**
   * Returns a cached value or runs `load` once per in-flight key.
   *
   * With SWR (`staleTime`): fresh → cached value; stale → cached value + background `load`;
   * missing → await `load`. Background revalidation errors are ignored.
   *
   * On settle: writes into this store when the constructor {@link ResolvableSwrCachePolicy.write}
   * allows (default), then runs optional {@link ResolvableSwrCachePolicy.onSettled}.
   */
  resolve<R>(key: string, load: () => Promise<R>): Promise<R> {
    const entry = this.store.lookup(key, true);

    if (entry.status === 'fresh') {
      return Promise.resolve(entry.value as unknown as R);
    }

    if (entry.status === 'stale') {
      void this.runLoad(key, load).catch(() => {});
      return Promise.resolve(entry.value as unknown as R);
    }

    return this.runLoad(key, load) as Promise<R>;
  }

  private runLoad<R>(key: string, load: () => Promise<R>): Promise<R> {
    const epoch = this.epoch;
    return this.singleflight.do(key, () =>
      load().then((value) => {
        // Dropped from singleflight map by clear/destroy — do not resurrect the store.
        if (epoch === this.epoch) this.commit(key, value);
        return value;
      }),
    ) as Promise<R>;
  }

  private commit(key: string, value: unknown): void {
    if (this.shouldWrite(value)) {
      this.store.set(key, value as T);
    }
    this.onSettled?.(key, value);
  }

  private shouldWrite(value: unknown): boolean {
    const write = this.write;
    if (write === undefined) return true;
    if (typeof write === 'function') return write(value);
    return write;
  }
}
