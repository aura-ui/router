/**
 * Route hook name resolution from phase attrs.
 *
 * Phase metadata lives in {@link ../phase-registry!PHASES}.
 *
 * @module lifecycle/bindings/route-hook-bindings
 */

import type { RouteHookNamesSource } from '../../route/types';
import { PHASES } from '../phase-registry';
import type { RoutePhase } from '../types';

/**
 * Resolves registered hook names for a phase on a route.
 *
 * @example
 * ```ts
 * // route: enter="auth" after="analytics"
 * resolveHookNames(route, 'enter');  // → ['auth']
 * resolveHookNames(route, 'left');   // → ['cleanup'] when left="cleanup"
 * ```
 */
export function resolveHookNames(
  source: RouteHookNamesSource,
  phase: RoutePhase,
): readonly string[] | null {
  const routeHookProp = PHASES[phase].routeHookProp;
  if (!routeHookProp) return null;
  const names = source[routeHookProp];
  return names?.length ? names : null;
}
