/** How {@link AuraCacheStore.invalidate} affects matching entries. */
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
  /** Max entries; evicts least recently used key first. */
  max?: number;
  /**
   * SWR fresh window in ms. After this, entries become stale but remain readable.
   * When `gcTime` is set, stale entries are evicted after `gcTime` elapses.
   */
  staleTime?: number;
  /**
   * Max age in ms since `storedAt` before an entry is evicted.
   * Without `staleTime`, expired entries are evicted on access (no stale phase).
   */
  gcTime?: number;
  /**
   * Background GC sweep interval in ms.
   *
   * - `undefined` — auto when `gcTime` is set: `clamp(gcTime / 2, 5s … 60s)`
   * - `number` — sweep every N ms
   * - `false` — disabled (lazy eviction on access; call {@link AuraCacheStore.purgeExpired} manually)
   */
  gcSweepInterval?: number | false;
  /** Default policy for {@link AuraCacheStore.invalidate} and bulk invalidation. */
  invalidatePolicy?: InvalidatePolicy;
  /** Called when an entry is evicted (LRU, GC, `delete`, `clear`, or `invalidate` with `remove`). */
  onEvict?: (key: string, value: T) => void;
};

/** Doubly-linked list node used by {@link AuraCacheStore}. */
interface Node<T> {
  key: string;
  value: T;
  storedAt: number;
  stale: boolean;
  prev: Node<T> | null;
  next: Node<T> | null;
}

/**
 * Minimal string-key in-memory store for content/DOM caches.
 *
 * Uses a `Map` for O(1) lookup and a doubly-linked list for O(1) LRU
 * promotion and eviction.
 *
 * **Simple mode** (`gcTime` without `staleTime`): expired entries are evicted on access.
 *
 * **SWR mode** (`staleTime` set): entries go `fresh` → `stale` → evicted
 * when `gcTime` elapses (if configured). Without `gcTime`, stale entries stay
 * until LRU eviction or explicit removal. Use {@link AuraCacheStore.lookup} to
 * decide whether a background revalidate is needed.
 *
 * GC runs lazily on access and proactively via {@link AuraCacheStore.purgeExpired}
 * or an optional background sweep (`gcSweepInterval`).
 *
 * `has` does not promote LRU order.
 */
export class AuraCacheStore<T> {
  private readonly max?: number;
  private readonly swrEnabled: boolean;
  private readonly staleTimeMs?: number;
  private readonly gcTimeMs?: number;
  private readonly gcSweepIntervalMs: number | null;
  private readonly defaultInvalidatePolicy: InvalidatePolicy;
  private readonly onEvict?: (key: string, value: T) => void;

  private readonly map = new Map<string, Node<T>>();
  private head: Node<T> | null = null;
  private tail: Node<T> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  /** @param options - Cache limits, SWR timings, and eviction callback. */
  constructor(options: CacheStoreOptions<T> = {}) {
    this.max = options.max;
    this.swrEnabled = options.staleTime !== undefined;
    this.staleTimeMs = options.staleTime;
    this.gcTimeMs = options.gcTime;
    this.gcSweepIntervalMs = resolveGcSweepInterval(options.gcTime, options.gcSweepInterval);
    this.defaultInvalidatePolicy = options.invalidatePolicy ?? 'stale';
    this.onEvict = options.onEvict;
  }

  /**
   * Returns a cached value when present (fresh or stale) and promotes LRU order.
   *
   * In simple GC mode, expired entries are evicted and `undefined` is returned.
   *
   * @param key - Cache key.
   * @returns The stored value, or `undefined` if missing or GC-expired.
   */
  get(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    const now = Date.now();
    if (this.checkAndEvictGc(node, now)) {
      return undefined;
    }

    if (node !== this.tail) {
      this.moveToEnd(node);
    }

    return node.value;
  }

  /**
   * Reads an entry with SWR status without evicting stale-but-readable data.
   *
   * @param key - Cache key.
   * @param touch - When `true`, promote the entry in the LRU list. Default `false`.
   * @returns Lookup result with `fresh`, `stale`, or `missing` status.
   */
  lookup(key: string, touch = false): CacheLookup<T> {
    const now = Date.now();
    const node = this.map.get(key);

    if (!node || this.checkAndEvictGc(node, now)) {
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

  /**
   * Stores a value under `key`, clearing manual stale flag and refreshing timestamps.
   *
   * Updates an existing entry in place without trimming. New entries are
   * appended and the least recently used entry is evicted when `max` is exceeded.
   *
   * @param key - Cache key.
   * @param value - Value to store.
   */
  set(key: string, value: T): void {
    const existingNode = this.map.get(key);
    const now = Date.now();

    if (existingNode) {
      existingNode.value = value;
      existingNode.storedAt = now;
      existingNode.stale = false;

      if (existingNode !== this.tail) {
        this.moveToEnd(existingNode);
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
      this.evictHead();
    }

    this.ensureSweepRunning();
  }

  /**
   * Returns whether a readable, non-GC-expired entry exists.
   *
   * Does not promote LRU order. GC-expired entries are evicted and return `false`.
   *
   * @param key - Cache key.
   * @returns `true` if the entry exists and is readable.
   */
  has(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    return !this.checkAndEvictGc(node, Date.now());
  }

  /**
   * Returns whether an entry is stale (by age or manual invalidation) but still readable.
   *
   * Returns `false` when the key is missing or GC-expired.
   *
   * @param key - Cache key.
   * @returns `true` if the entry is stale and readable.
   */
  isStale(key: string): boolean {
    const now = Date.now();
    const node = this.map.get(key);
    if (!node || this.checkAndEvictGc(node, now)) return false;

    return this.readStatus(node, now) === 'stale';
  }

  /**
   * Evicts all GC-expired entries. No-op when `gcTime` is not configured.
   *
   * @returns Number of evicted entries.
   */
  purgeExpired(): number {
    return this.sweepExpired();
  }

  /**
   * Invalidates a single entry.
   *
   * @param key - Cache key.
   * @param policy - `remove` deletes immediately; `stale` keeps value for SWR reads. Defaults to `invalidatePolicy`.
   * @returns `true` if an entry was affected.
   */
  invalidate(key: string, policy: InvalidatePolicy = this.defaultInvalidatePolicy): boolean {
    const node = this.map.get(key);
    if (!node) return false;

    if (policy === 'remove') {
      this.evictNode(node);
    } else {
      node.stale = true;
    }
    return true;
  }

  /**
   * Invalidates entries whose keys match `predicate`.
   *
   * @param predicate - Key filter.
   * @param policy - `remove` deletes immediately; `stale` keeps value for SWR reads. Defaults to `invalidatePolicy`.
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
   * Invalidates every entry.
   *
   * @param policy - `remove` deletes immediately; `stale` keeps values for SWR reads. Defaults to `invalidatePolicy`.
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
   * Removes an entry and invokes `onEvict` when configured.
   *
   * @param key - Cache key.
   * @returns `true` if an entry was removed.
   */
  delete(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.evictNode(node);
    return true;
  }

  /** Removes all entries, stops the background sweep, and invokes `onEvict` for each entry when configured. */
  clear(): void {
    this.stopSweep();

    const onEvict = this.onEvict;
    if (onEvict) {
      let current = this.head;
      while (current) {
        const next = current.next;
        onEvict(current.key, current.value);
        current = next;
      }
    }
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  /** Same as {@link AuraCacheStore.clear}. */
  destroy(): void {
    this.clear();
  }

  /** Number of entries currently stored (including stale and not-yet-GC-evicted). */
  get size(): number {
    return this.map.size;
  }

  /** Evicts the entry when it exceeded `gcTime`; returns whether eviction happened. */
  private checkAndEvictGc(node: Node<T>, now: number): boolean {
    if (this.gcTimeMs === undefined) return false;
    if (now - node.storedAt <= this.gcTimeMs) return false;

    this.evictNode(node);
    return true;
  }

  private readStatus(node: Node<T>, now: number): 'fresh' | 'stale' {
    if (node.stale) return 'stale';

    if (!this.swrEnabled) return 'fresh';

    const staleTime = this.staleTimeMs;
    if (staleTime === Infinity) return 'fresh';

    return now - node.storedAt > staleTime! ? 'stale' : 'fresh';
  }

  private sweepExpired(): number {
    const gcTimeMs = this.gcTimeMs;
    if (gcTimeMs === undefined) return 0;

    const now = Date.now();
    let count = 0;
    let current = this.head;

    while (current) {
      const next = current.next;
      if (now - current.storedAt > gcTimeMs) {
        this.evictNode(current);
        count++;
      }
      current = next;
    }

    return count;
  }

  private ensureSweepRunning(): void {
    if (this.gcSweepIntervalMs === null || this.map.size === 0) return;
    this.startSweep();
  }

  private startSweep(): void {
    if (this.gcSweepIntervalMs === null || this.sweepTimer !== null) return;
    if (typeof setInterval === 'undefined') return;

    this.sweepTimer = setInterval(() => {
      this.sweepExpired();
    }, this.gcSweepIntervalMs);
  }

  private stopSweep(): void {
    if (this.sweepTimer === null) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  private invalidateMatchRemove(predicate: (key: string) => boolean): number {
    let count = 0;
    let current = this.head;

    while (current) {
      const next = current.next;
      if (predicate(current.key)) {
        this.evictNode(current);
        count++;
      }
      current = next;
    }
    return count;
  }

  private moveToEnd(node: Node<T>): void {
    if (node === this.tail) return;

    const prev = node.prev;
    const next = node.next;

    if (prev) prev.next = next;
    if (next) next.prev = prev;

    if (node === this.head) this.head = next;

    this.addToEnd(node);
  }

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

  private evictNode(node: Node<T>): void {
    const { key, value } = node;

    const prev = node.prev;
    const next = node.next;

    if (prev) prev.next = next;
    if (next) next.prev = prev;

    if (node === this.head) this.head = next;
    if (node === this.tail) this.tail = prev;

    this.map.delete(key);

    const onEvict = this.onEvict;
    if (onEvict) onEvict(key, value);

    if (this.map.size === 0) {
      this.stopSweep();
    }
  }

  private evictHead(): void {
    if (!this.head) return;
    this.evictNode(this.head);
  }
}

function resolveGcSweepInterval(
  gcTime: number | undefined,
  gcSweepInterval: number | false | undefined,
): number | null {
  if (gcSweepInterval === false) return null;
  if (gcSweepInterval !== undefined) return gcSweepInterval;
  if (gcTime === undefined) return null;

  return Math.min(Math.max(gcTime / 2, 5_000), 60_000);
}
