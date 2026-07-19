import type { EngineEvent, EngineEventListener } from './types';

/**
 * Sync fan-out for navigation / load observability.
 * Same shape as {@link ../prefetch/intent/bus!PrefetchIntentBus}; separate axis by design.
 */
export class EventBus {
  private readonly listeners = new Set<EngineEventListener>();

  subscribe(listener: EngineEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  destroy(): void {
    this.listeners.clear();
  }
}
