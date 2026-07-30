import type { PrefetchIntent } from '../types';

/** Fan-out for DOM / programmatic prefetch intents. */
export class PrefetchIntentBus {
  private readonly listeners = new Set<(intent: PrefetchIntent) => void>();

  subscribe(listener: (intent: PrefetchIntent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(intent: PrefetchIntent): void {
    for (const listener of this.listeners) {
      listener(intent);
    }
  }

  destroy(): void {
    this.listeners.clear();
  }
}
