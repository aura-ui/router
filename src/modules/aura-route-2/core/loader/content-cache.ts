import type { ViewPayload } from '../view/ports';

/** In-memory content cache with in-flight deduplication. */
export class ContentCache {
  private readonly entries = new Map<string, ViewPayload>();
  private readonly inflight = new Map<string, Promise<ViewPayload | null>>();

  get(key: string): ViewPayload | undefined {
    return this.entries.get(key);
  }

  set(key: string, payload: ViewPayload): void {
    this.entries.set(key, payload);
  }

  delete(key: string): void {
    this.entries.delete(key);
    this.inflight.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  async resolve(
    key: string,
    load: () => Promise<ViewPayload | null>,
  ): Promise<ViewPayload | null> {
    const cached = this.entries.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = load().then((payload) => {
      if (typeof payload === 'string') {
        this.entries.set(key, payload);
      }
      return payload;
    }).finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }
}

export const defaultContentCache = new ContentCache();
