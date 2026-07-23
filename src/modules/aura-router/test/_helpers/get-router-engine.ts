import type { AuraRoutingEngine } from '../../../aura-routing-engine/core';
import type { AuraRouter } from '../../core/aura-router';

/** Test-only access to the private engine (bus is not on AuraRouter public API). */
export function getRouterEngine(router: AuraRouter): AuraRoutingEngine {
  const engine = (router as unknown as { engine?: AuraRoutingEngine }).engine;
  if (!engine) {
    throw new Error('AuraRouter engine is not created yet');
  }
  return engine;
}
