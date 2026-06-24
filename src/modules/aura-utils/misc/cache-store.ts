export type CacheStoreOptions<T> = {
  /** Max entries; least recently used key is dropped first. */
  max?: number;
  /** Entry lifetime in ms; expired entries are removed on read. */
  ttl?: number;
  /** Called when an entry is evicted (LRU, TTL, delete, clear). */
  onEvict?: (key: string, value: T) => void;
};

type CacheEntry<T> = {
  value: T;
  storedAt: number;
};

/**
 * Minimal string-key store for content/DOM caches.
 * Optional LRU (`max`) and TTL (`ttl`); both can be combined.
 */
export class CacheStore<T> {
  private readonly max?: number;
  private readonly ttl?: number;
  private readonly onEvict?: (key: string, value: T) => void;
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(options: CacheStoreOptions<T> = {}) {
    this.max = options.max;
    this.ttl = options.ttl;
    this.onEvict = options.onEvict;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.drop(key, entry);
      return undefined;
    }

    if (this.max !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
    }

    this.entries.set(key, { value, storedAt: Date.now() });
    this.trim();
  }

  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.drop(key, entry);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.drop(key, entry);
    return true;
  }

  clear(): void {
    for (const [key, entry] of this.entries) {
      this.onEvict?.(key, entry.value);
    }
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return this.ttl !== undefined && Date.now() - entry.storedAt > this.ttl;
  }

  private drop(key: string, entry: CacheEntry<T>): void {
    this.entries.delete(key);
    this.onEvict?.(key, entry.value);
  }

  private trim(): void {
    if (this.max === undefined) return;

    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      const entry = this.entries.get(oldest);
      if (entry) this.drop(oldest, entry);
    }
  }
}
