/** How {@link LRUCacheStore.invalidate} affects matching entries. */
export type InvalidatePolicy = 'remove' | 'stale';

/** Result of {@link LRUCacheStore.lookup}. */
export type CacheEntryStatus = 'fresh' | 'stale' | 'missing';

/** Cache read result with SWR status. */
export type CacheLookup<T> =
  | { status: 'missing' }
  | { status: 'fresh'; value: T }
  | { status: 'stale'; value: T };

/** Configuration for {@link LRUCacheStore}. */
export type CacheStoreOptions<T> = {
  /** Max entries; least recently used key is evicted first. */
  max?: number;
  /**
   * SWR fresh window in ms. After this, entries are stale but still readable
   * until `gcTime` elapses.
   */
  staleTime?: number;
  /**
   * Max age in ms since `storedAt` before an entry is removed on read.
   * Without `staleTime`, expired entries are removed with no stale phase.
   */
  gcTime?: number;
  /** Default policy for {@link LRUCacheStore.invalidate} and bulk invalidation. */
  invalidatePolicy?: InvalidatePolicy;
  /** Called when an entry is evicted (LRU, GC, delete, clear, invalidate remove). */
  onEvict?: (key: string, value: T) => void;
};

/** Doubly-linked list node used by {@link LRUCacheStore}. */
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
 * **Simple mode** (`gcTime` only): expired entries are removed on read.
 *
 * **SWR mode** (`staleTime` set): entries move through `fresh` → `stale`
 * → removed (when `gcTime` elapses). Use {@link lookup} to decide
 * whether a background revalidate is needed.
 *
 * `has` does not promote LRU order. GC expiry is lazy (on read).
 */
export class LRUCacheStore<T> {
  private readonly max?: number;
  private readonly swrEnabled: boolean;
  private readonly staleTimeMs?: number;
  private readonly gcTimeMs?: number;
  private readonly defaultInvalidatePolicy: InvalidatePolicy;
  private readonly onEvict?: (key: string, value: T) => void;

  private readonly map = new Map<string, Node<T>>();
  private head: Node<T> | null = null;
  private tail: Node<T> | null = null;

  /** @param options - Cache limits, SWR timings, and eviction callback. */
  constructor(options: CacheStoreOptions<T> = {}) {
    this.max = options.max;
    this.swrEnabled = options.staleTime !== undefined;
    this.staleTimeMs = options.staleTime;
    this.gcTimeMs = options.gcTime;
    this.defaultInvalidatePolicy = options.invalidatePolicy ?? 'stale';
    this.onEvict = options.onEvict;
  }

  /**
   * Returns a cached value when present (fresh or stale) and promotes LRU order.
   *
   * In simple GC mode, expired entries are removed and `undefined` is returned.
   *
   * @param key - Cache key.
   * @returns The stored value, or `undefined` if missing or GC expired.
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
   * Reads an entry with SWR status without removing stale-but-readable data.
   *
   * @param key - Cache key.
   * @param touch - Promote the entry in the LRU list when `true`. Default `false`.
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
  }

  /**
   * Checks whether a readable (fresh or stale) non-GC-expired entry exists.
   *
   * Does not promote the entry in the LRU list.
   *
   * @param key - Cache key.
   */
  has(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    return !this.checkAndEvictGc(node, Date.now());
  }

  /**
   * Returns whether an entry is stale (auto or manual) but still readable.
   *
   * @param key - Cache key.
   */
  isStale(key: string): boolean {
    const now = Date.now();
    const node = this.map.get(key);
    if (!node || this.checkAndEvictGc(node, now)) return false;

    return this.readStatus(node, now) === 'stale';
  }

  /**
   * Invalidates a single entry.
   *
   * @param key - Cache key.
   * @param policy - `remove` deletes immediately; `stale` keeps value for SWR reads.
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
   * Invalidates entries whose keys satisfy `predicate`.
   *
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
   * Invalidates all entries.
   *
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

  /** Removes all entries and invokes `onEvict` for each when configured. */
  clear(): void {
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

  /** Number of entries currently stored (including stale and not-yet-GC-evicted). */
  get size(): number {
    return this.map.size;
  }

  /** Returns `true` when the entry exceeded `gcTime` and was evicted. */
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
  }

  private evictHead(): void {
    if (!this.head) return;
    this.evictNode(this.head);
  }
}
