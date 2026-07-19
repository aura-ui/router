import type { EngineEvent, EngineEventListener } from './types';

/**
 * Sync fan-out for navigation / load observability.
 * Same shape as {@link ../prefetch/intent/bus!PrefetchIntentBus}; separate axis by design.
 *
 * Engine code emits via {@link ../navigation/navigation-pulse!NavigationPulse} (observe-only),
 * not by calling {@link emit} ad-hoc from pipeline / finalizers.
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
