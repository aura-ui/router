/** Default `gcTime` in SWR mode when omitted (5 minutes). */
export const DEFAULT_GC_TIME = 5 * 60_000;

/** `'stale'` — mark outdated, keep serving until revalidated; `'remove'` — delete from cache. */
export type InvalidatePolicy = 'remove' | 'stale';

/** Status returned by {@link AuraCacheStore.lookup}. */
export type CacheEntryStatus = 'fresh' | 'stale' | 'missing';

/** Result of {@link AuraCacheStore.lookup}. */
export type CacheLookup<T> =
  | { status: 'missing' }
  | { status: 'fresh'; value: T }
  | { status: 'stale'; value: T };

/** Configuration for {@link AuraCacheStore}. */
export type CacheStoreOptions<T> = {
  /** Max entries; removes least recently used key first. */
  max?: number;
  /**
   * SWR fresh window in ms (stale-while-revalidate).
   * Enables SWR mode: after this age entries become stale but stay readable until removed.
   */
  staleTime?: number;
  /**
   * Max age in ms since `storedAt` before an entry is removed.
   * With `staleTime`, defaults to {@link DEFAULT_GC_TIME}. Pass `Infinity` to disable TTL removal.
   * Without `staleTime`, expired entries are removed on access (no stale phase).
   */
  gcTime?: number;
  /**
   * Background GC sweep interval in ms.
   *
   * - `undefined` — auto when `gcTime` is set: `clamp(gcTime / 2, 5s … 60s)`
   * - `number` — run {@link AuraCacheStore.purgeExpired} every N ms (no-op without `gcTime`)
   * - `false` — disabled; removal on access or manual {@link AuraCacheStore.purgeExpired} only
   *
   * Timer starts on the first `set()` while the store is non-empty, stops when the store
   * becomes empty or on {@link AuraCacheStore.clear}, and restarts on the next `set()`.
   */
  gcSweepInterval?: number | false;
  /** Default invalidation policy. See {@link InvalidatePolicy}. */
  invalidatePolicy?: InvalidatePolicy;
  /** Called when an entry is removed (LRU, GC, `delete`, `clear`, or `invalidate` with `remove`). */
  onRemove?: (key: string, value: T) => void;
};

/** Doubly-linked list node for LRU order. */
interface Node<T> {
  /** Cache key. */
  key: string;
  /** Stored value. */
  value: T;
  /** `Date.now()` when the entry was last written via `set`. */
  storedAt: number;
  /** Manual stale flag set by `invalidate(..., 'stale')`. */
  stale: boolean;
  /** Previous node in the LRU list. */
  prev: Node<T> | null;
  /** Next node in the LRU list. */
  next: Node<T> | null;
}

/**
 * String-key in-memory cache for content/DOM snapshots.
 *
 * `Map` + doubly-linked list: O(1) lookup, LRU promotion, and removal.
 *
 * **Simple GC** (`gcTime` without `staleTime`): remove on access after TTL.
 *
 * **SWR** (`staleTime`, stale-while-revalidate): serve cached data immediately;
 * when outdated, keep serving stale value and revalidate in the background.
 * Lifecycle: `fresh` → `stale` → removed after `gcTime` (default {@link DEFAULT_GC_TIME}).
 * Use {@link AuraCacheStore.lookup} to read status. `gcTime: Infinity` disables TTL removal.
 *
 * GC is lazy on access (`get`, `has`, `lookup`, `isStale`) and proactive via
 * {@link AuraCacheStore.purgeExpired} or background sweep (`gcSweepInterval`).
 * `has`, `isStale`, and `lookup` without `touch` do not promote LRU order.
 */
export class AuraCacheStore<T> {
  private readonly max?: number;
  private readonly swrEnabled: boolean;
  private readonly staleTimeMs?: number;
  private readonly gcTimeMs?: number;
  private readonly gcSweepIntervalMs: number | null;
  private readonly defaultInvalidatePolicy: InvalidatePolicy;
  private readonly onRemove?: (key: string, value: T) => void;
  /** Whether entries need `storedAt` / age checks (`staleTime` or `gcTime`). */
  private readonly trackAge: boolean;

  private readonly map = new Map<string, Node<T>>();
  private head: Node<T> | null = null;
  private tail: Node<T> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param options - Cache limits, SWR timings, invalidation defaults, and removal callback.
   */
  constructor(options: CacheStoreOptions<T> = {}) {
    this.max = options.max;
    this.swrEnabled = options.staleTime !== undefined;
    this.staleTimeMs = options.staleTime;
    this.gcTimeMs =
      options.gcTime ?? (options.staleTime !== undefined ? DEFAULT_GC_TIME : undefined);
    this.gcSweepIntervalMs = resolveGcSweepInterval(this.gcTimeMs, options.gcSweepInterval);
    this.defaultInvalidatePolicy = options.invalidatePolicy ?? 'stale';
    this.onRemove = options.onRemove;
    this.trackAge = this.gcTimeMs !== undefined || this.swrEnabled;
  }

  /**
   * Returns a cached value when present (fresh or stale) and promotes LRU order.
   * GC-expired entries are removed on access.
   *
   * @param key - Cache key.
   * @returns The stored value, or `undefined` if missing or GC-expired.
   */
  get(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    if (this.gcTimeMs !== undefined && this.removeIfExpired(node, Date.now())) {
      return undefined;
    }

    if (node !== this.tail) {
      this.moveToEnd(node);
    }

    return node.value;
  }

  /**
   * Reads an entry with `fresh` / `stale` / `missing` status.
   *
   * In SWR mode (`staleTime`), age past `staleTime` yields `stale` while the entry
   * remains readable. GC-expired entries are removed on access (same as {@link get}).
   * Stale-but-readable entries are not removed by this method.
   *
   * @param key - Cache key.
   * @param touch - When `true`, promote the entry in the LRU list. Default `false`.
   * @returns Lookup result with `fresh`, `stale`, or `missing` status.
   */
  lookup(key: string, touch = false): CacheLookup<T> {
    const node = this.map.get(key);

    if (!node) {
      return { status: 'missing' };
    }

    if (this.trackAge) {
      const now = Date.now();
      if (this.gcTimeMs !== undefined && this.removeIfExpired(node, now)) {
        return { status: 'missing' };
      }

      if (touch && node !== this.tail) {
        this.moveToEnd(node);
      }

      const status = this.readStatus(node, now);
      return status === 'fresh'
        ? { status: 'fresh', value: node.value }
        : { status: 'stale', value: node.value };
    }

    if (touch && node !== this.tail) {
      this.moveToEnd(node);
    }

    if (node.stale) {
      return { status: 'stale', value: node.value };
    }

    return { status: 'fresh', value: node.value };
  }

  /**
   * Stores a value under `key`, clearing stale flag and refreshing `storedAt`.
   *
   * Updates an existing entry in place without LRU trim. Overwriting invokes
   * `onRemove` for the previous value when it differs. New entries may remove
   * the least recently used key when `max` is exceeded.
   *
   * @param key - Cache key.
   * @param value - Value to store.
   */
  set(key: string, value: T): void {
    const existingNode = this.map.get(key);
    const now = this.trackAge ? Date.now() : 0;

    if (existingNode) {
      const previous = existingNode.value;

      existingNode.value = value;
      existingNode.stale = false;
      if (this.trackAge) {
        existingNode.storedAt = now;
      }

      if (existingNode !== this.tail) {
        this.moveToEnd(existingNode);
      }

      if (previous !== value) {
        this.onRemove?.(key, previous);
      }

      this.ensureSweepRunning();
      return;
    }

    const newNode: Node<T> = {
      key,
      value,
      storedAt: now,
      stale: false,
      prev: null,
      next: null,
    };

    this.addToEnd(newNode);
    this.map.set(key, newNode);

    if (this.max !== undefined && this.map.size > this.max) {
      this.removeLruHead();
    }

    this.ensureSweepRunning();
  }

  /**
   * Returns whether a readable, non-GC-expired entry exists.
   *
   * Does not promote LRU order. GC-expired entries are removed and return `false`.
   *
   * @param key - Cache key.
   * @returns `true` if the entry exists and is readable.
   */
  has(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    if (this.gcTimeMs === undefined) return true;
    return !this.removeIfExpired(node, Date.now());
  }

  /**
   * Returns whether an entry is stale (by age or manual invalidation) but still readable.
   *
   * @param key - Cache key.
   * @returns `true` if stale and readable; `false` if missing, fresh, or GC-expired.
   */
  isStale(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;

    const now = Date.now();
    if (this.gcTimeMs !== undefined && this.removeIfExpired(node, now)) return false;

    if (node.stale) return true;
    if (!this.swrEnabled) return false;

    return this.readStatus(node, now) === 'stale';
  }

  /**
   * Removes all GC-expired entries.
   *
   * @returns Number of removed entries. No-op when `gcTime` is not configured.
   */
  purgeExpired(): number {
    return this.sweepExpired();
  }

  /**
   * Marks an entry outdated or removes it. Use after mutations or route changes.
   * Does not promote LRU order.
   *
   * @param key - Cache key.
   * @param policy - `'stale'` keeps value for SWR reads; `'remove'` deletes immediately.
   *   Defaults to `invalidatePolicy`.
   * @returns `true` if an entry was affected.
   */
  invalidate(key: string, policy: InvalidatePolicy = this.defaultInvalidatePolicy): boolean {
    const node = this.map.get(key);
    if (!node) return false;

    if (policy === 'remove') {
      this.removeNode(node);
    } else {
      node.stale = true;
    }
    return true;
  }

  /**
   * Marks matching entries outdated or removes them. See {@link AuraCacheStore.invalidate}.
   *
   * @param predicate - Key filter.
   * @param policy - Defaults to `invalidatePolicy`.
   * @returns Number of affected entries.
   */
  invalidateMatch(
    predicate: (key: string) => boolean,
    policy: InvalidatePolicy = this.defaultInvalidatePolicy,
  ): number {
    if (policy === 'remove') {
      return this.invalidateMatchRemove(predicate);
    }

    let count = 0;

    for (const [key, node] of this.map) {
      if (predicate(key)) {
        node.stale = true;
        count++;
      }
    }
    return count;
  }

  /**
   * Marks every entry outdated or removes all. See {@link AuraCacheStore.invalidate}.
   *
   * @param policy - Defaults to `invalidatePolicy`.
   * @returns Number of affected entries.
   */
  invalidateAll(policy: InvalidatePolicy = this.defaultInvalidatePolicy): number {
    if (policy === 'stale') {
      let count = 0;
      for (const node of this.map.values()) {
        node.stale = true;
        count++;
      }
      return count;
    }

    return this.invalidateMatch(() => true, policy);
  }

  /**
   * Returns a cached value and removes the entry without invoking `onRemove`.
   * GC-expired entries are removed normally (with `onRemove` when configured).
   *
   * @param key - Cache key.
   * @returns The stored value, or `undefined` if missing or GC-expired.
   */
  extract(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    if (this.gcTimeMs !== undefined && this.removeIfExpired(node, Date.now())) {
      return undefined;
    }

    const value = node.value;
    this.unlinkNode(node);
    return value;
  }

  /**
   * Removes an entry and invokes `onRemove` when configured.
   *
   * @param key - Cache key.
   * @returns `true` if an entry was removed.
   */
  delete(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    return true;
  }

  /**
   * Removes all entries, stops the background sweep, and invokes `onRemove` for each when configured.
   * The store can be reused; the next `set()` restarts the background sweep when configured.
   */
  clear(): void {
    this.stopSweep();

    const onRemove = this.onRemove;
    if (onRemove) {
      let current = this.head;
      while (current) {
        const next = current.next;
        onRemove(current.key, current.value);
        current = next;
      }
    }
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Releases the store. Same as {@link AuraCacheStore.clear}.
   */
  destroy(): void {
    this.clear();
  }

  /**
   * Number of entries stored (including stale and not-yet-GC-removed).
   *
   * @returns Current entry count.
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Removes the entry when it exceeded `gcTime`.
   *
   * @param node - Entry to check.
   * @param now - Current timestamp.
   * @returns `true` if the entry was removed.
   */
  private removeIfExpired(node: Node<T>, now: number): boolean {
    if (this.gcTimeMs === undefined) return false;
    if (now - node.storedAt <= this.gcTimeMs) return false;

    this.removeNode(node);
    return true;
  }

  /**
   * Resolves SWR status from entry age and manual stale flag.
   *
   * @param node - Entry to read.
   * @param now - Current timestamp.
   * @returns `'fresh'` or `'stale'`.
   */
  private readStatus(node: Node<T>, now: number): 'fresh' | 'stale' {
    if (node.stale) return 'stale';

    if (!this.swrEnabled) return 'fresh';

    const staleTime = this.staleTimeMs;
    if (staleTime === Infinity) return 'fresh';

    return now - node.storedAt > staleTime! ? 'stale' : 'fresh';
  }

  /**
   * Walks the LRU list and removes all GC-expired entries.
   *
   * @returns Number of removed entries.
   */
  private sweepExpired(): number {
    const gcTimeMs = this.gcTimeMs;
    if (gcTimeMs === undefined) return 0;

    const now = Date.now();
    let count = 0;
    let current = this.head;

    while (current) {
      const next = current.next;
      if (now - current.storedAt > gcTimeMs) {
        this.removeNode(current);
        count++;
      }
      current = next;
    }

    return count;
  }

  /** Starts background sweep when `gcSweepInterval` is configured and the store is non-empty. */
  private ensureSweepRunning(): void {
    if (this.gcSweepIntervalMs === null || this.map.size === 0) return;
    this.startSweep();
  }

  /** Schedules periodic GC sweep via `setInterval`. */
  private startSweep(): void {
    if (this.gcSweepIntervalMs === null || this.sweepTimer !== null) return;
    if (typeof setInterval === 'undefined') return;

    this.sweepTimer = setInterval(() => {
      this.sweepExpired();
    }, this.gcSweepIntervalMs);
  }

  /** Clears the background sweep timer. */
  private stopSweep(): void {
    if (this.sweepTimer === null) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /**
   * Removes entries matching `predicate` and invokes `onRemove` for each.
   *
   * @param predicate - Key filter.
   * @returns Number of removed entries.
   */
  private invalidateMatchRemove(predicate: (key: string) => boolean): number {
    let count = 0;
    let current = this.head;

    while (current) {
      const next = current.next;
      if (predicate(current.key)) {
        this.removeNode(current);
        count++;
      }
      current = next;
    }
    return count;
  }

  /**
   * Detaches `node` from its current position and appends it to the LRU tail.
   *
   * @param node - Entry to promote.
   */
  private moveToEnd(node: Node<T>): void {
    if (node === this.tail) return;

    const prev = node.prev;
    const next = node.next;

    if (prev) prev.next = next;
    if (next) next.prev = prev;

    if (node === this.head) this.head = next;

    this.addToEnd(node);
  }

  /**
   * Appends `node` to the LRU tail.
   *
   * @param node - Entry to append. `prev`/`next` are rewritten.
   */
  private addToEnd(node: Node<T>): void {
    if (this.tail) {
      this.tail.next = node;
      node.prev = this.tail;
      this.tail = node;
    } else {
      this.head = node;
      this.tail = node;
    }
  }

  /**
   * Detaches `node` from the map and LRU list without invoking `onRemove`.
   * Stops background sweep when the store becomes empty.
   *
   * @param node - Entry to unlink.
   */
  private unlinkNode(node: Node<T>): void {
    const { key } = node;

    const prev = node.prev;
    const next = node.next;

    if (prev) prev.next = next;
    if (next) next.prev = prev;

    if (node === this.head) this.head = next;
    if (node === this.tail) this.tail = prev;

    this.map.delete(key);

    if (this.map.size === 0) {
      this.stopSweep();
    }
  }

  /** Unlinks `node` and invokes `onRemove` when configured. */
  private removeNode(node: Node<T>): void {
    const { key, value } = node;
    this.unlinkNode(node);

    const onRemove = this.onRemove;
    if (onRemove) onRemove(key, value);
  }

  /** Removes the least recently used entry (LRU head). */
  private removeLruHead(): void {
    if (!this.head) return;
    this.removeNode(this.head);
  }
}

/**
 * Resolves background sweep interval from `gcTime` and `gcSweepInterval` options.
 *
 * @param gcTime - Resolved GC TTL.
 * @param gcSweepInterval - User override.
 * @returns Interval in ms, or `null` when sweep is disabled.
 */
function resolveGcSweepInterval(
  gcTime: number | undefined,
  gcSweepInterval: number | false | undefined,
): number | null {
  if (gcSweepInterval === false) return null;
  if (gcSweepInterval !== undefined) return gcSweepInterval;
  if (gcTime === undefined) return null;

  return Math.min(Math.max(gcTime / 2, 5_000), 60_000);
}
