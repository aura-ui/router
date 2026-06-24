/** Configuration for {@link LRUCacheStore}. */
export type CacheStoreOptions<T> = {
  /** Max entries; least recently used key is evicted first. */
  max?: number;
  /** Entry lifetime in ms; expired entries are removed on read. */
  ttl?: number;
  /** Called when an entry is evicted (LRU, TTL, delete, clear). */
  onEvict?: (key: string, value: T) => void;
};

/** Doubly-linked list node used by {@link LRUCacheStore}. */
interface Node<T> {
  key: string;
  value: T;
  storedAt: number;
  prev: Node<T> | null;
  next: Node<T> | null;
}

/**
 * Minimal string-key in-memory store for content/DOM caches.
 *
 * Uses a `Map` for O(1) lookup and a doubly-linked list for O(1) LRU
 * promotion and eviction. Optional `max` (LRU) and `ttl` can be combined.
 *
 * TTL is lazy: expired entries are removed on `get` / `has`, not in the background.
 * `has` does not update LRU order.
 */
export class LRUCacheStore<T> {
  private readonly max?: number;
  private readonly ttl?: number;
  private readonly onEvict?: (key: string, value: T) => void;

  private readonly map = new Map<string, Node<T>>();
  private head: Node<T> | null = null;
  private tail: Node<T> | null = null;

  /** @param options - Cache limits and eviction callback. */
  constructor(options: CacheStoreOptions<T> = {}) {
    this.max = options.max;
    this.ttl = options.ttl;
    this.onEvict = options.onEvict;
  }

  /**
   * Returns a cached value and promotes the entry to most recently used.
   *
   * @param key - Cache key.
   * @returns The stored value, or `undefined` if missing or expired.
   */
  get(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    if (this.ttl !== undefined && Date.now() - node.storedAt > this.ttl) {
      this.evictNode(node);
      return undefined;
    }

    if (node !== this.tail) {
      this.moveToEnd(node);
    }

    return node.value;
  }

  /**
   * Stores a value under `key`, refreshing TTL and LRU order.
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

      if (existingNode !== this.tail) {
        this.moveToEnd(existingNode);
      }
      return;
    }

    const newNode: Node<T> = {
      key,
      value,
      storedAt: now,
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
   * Checks whether a non-expired entry exists for `key`.
   *
   * Does not promote the entry in the LRU list.
   *
   * @param key - Cache key.
   * @returns `true` if a fresh entry exists.
   */
  has(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;

    if (this.ttl !== undefined && Date.now() - node.storedAt > this.ttl) {
      this.evictNode(node);
      return false;
    }
    return true;
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

  /**
   * Removes all entries and invokes `onEvict` for each when configured.
   */
  clear(): void {
    if (this.onEvict) {
      let current = this.head;
      while (current) {
        const next = current.next;
        this.onEvict(current.key, current.value);
        current = next;
      }
    }
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  /** Number of entries currently stored (including not-yet-lazy-evicted TTL entries). */
  get size(): number {
    return this.map.size;
  }

  private moveToEnd(node: Node<T>): void {
    if (node === this.tail) return;

    const prev = node.prev;
    const next = node.next;

    if (prev) prev.next = next;
    if (next) next.prev = prev;

    if (node === this.head) {
      this.head = next;
    }

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
    this.onEvict?.(key, value);
  }

  private evictHead(): void {
    if (!this.head) return;
    this.evictNode(this.head);
  }
}
