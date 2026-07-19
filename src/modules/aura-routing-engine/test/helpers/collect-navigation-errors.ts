import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import type { NavigationFailure } from '../../core/failure';

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
