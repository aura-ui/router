import type { RouteMatch } from '../../aura-routing-engine/core';

/** Reference to a route node in a transition plan. */
export interface RouteRef {
  pattern: string;
  match: RouteMatch;
}

/**
 * Two-channel transition plan:
 * - deactivate: bubble (leaf → LCA) — exit pipeline
 * - activate: capture (LCA → leaf) — enter pipeline
 *
 * Flat routes: 0..1 node per side. Nested (stage 6) fills branches.
 */
export interface TransitionPlan {
  deactivate: RouteRef[];
  activate: RouteRef[];
  lca: RouteRef | null;
  reentered: boolean;
}

export function buildPlan(from: RouteMatch | null, to: RouteMatch): TransitionPlan {
  const toRef: RouteRef = { pattern: to.pattern, match: to };

  if (!from) {
    return { deactivate: [], activate: [toRef], lca: null, reentered: false };
  }

  const reentered = from.pattern === to.pattern && from.path === to.path;
  if (reentered) {
    return { deactivate: [], activate: [toRef], lca: toRef, reentered: true };
  }

  const fromRef: RouteRef = { pattern: from.pattern, match: from };
  return { deactivate: [fromRef], activate: [toRef], lca: null, reentered: false };
}
