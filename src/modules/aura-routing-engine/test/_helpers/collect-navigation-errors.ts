import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import type { EngineEvent } from '../../core/events';
import type { NavigationFailure } from '../../core/failure';

/** Capture every engine bus event in order. */
export function collectEngineEvents(engine: AuraRoutingEngine): EngineEvent[] {
  const seen: EngineEvent[] = [];
  engine.events.subscribe((event) => {
    seen.push(event);
  });
  return seen;
}

/** Map collected events to their `type` field. */
export function eventTypes(events: readonly EngineEvent[]): EngineEvent['type'][] {
  return events.map((event) => event.type);
}

/** Test helper: capture `navigation:error` failures from the engine bus. */
export function collectNavigationErrors(engine: AuraRoutingEngine): NavigationFailure[] {
  const seen: NavigationFailure[] = [];
  engine.events.subscribe((event) => {
    if (event.type === 'navigation:error') {
      seen.push(event.failure);
    }
  });
  return seen;
}
