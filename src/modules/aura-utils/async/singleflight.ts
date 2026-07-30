/**
 * Coalesces concurrent async work by key: parallel callers share one Promise.
 * The in-flight entry is removed on settle so the next call can run `fn` again.
 */
export class Singleflight<K, T> {
  private readonly pending = new Map<K, Promise<T>>();

  do(key: K, fn: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;

    const promise = fn().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }

  /** In-flight promise for `key`, if any — does not start work. */
  get(key: K): Promise<T> | undefined {
    return this.pending.get(key);
  }

  delete(key: K): void {
    this.pending.delete(key);
  }

  clear(): void {
    this.pending.clear();
  }
}
