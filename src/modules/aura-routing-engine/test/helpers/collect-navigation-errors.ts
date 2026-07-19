import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import type { FailedNavigation } from '../../core/failure';

/** Test helper: capture `navigation:error` failures from the engine bus. */
export function collectNavigationErrors(engine: AuraRoutingEngine): FailedNavigation[] {
  const seen: FailedNavigation[] = [];
  engine.events.subscribe((event) => {
    if (event.type === 'navigation:error') {
      seen.push(event.failure);
    }
  });
  return seen;
}
