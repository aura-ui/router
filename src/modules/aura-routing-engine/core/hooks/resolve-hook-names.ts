/**
 * Route hook name resolution from phase attrs.
 *
 * Phase metadata lives in {@link ../navigation/navigation-transaction-pipeline-phases-names!PHASES}.
 *
 * @module hooks/resolve-hook-names
 */

import { PHASES } from '../navigation/navigation-transaction-pipeline-phases-names';
import type { RoutePhase } from '../navigation/types';
import type { RouteHookNamesSource } from '../route/types';

/**
 * Resolves registered hook names for a phase on a route.
 *
 * @example
 * ```ts
 * // route: guard="auth" ready="analytics"
 * resolveHookNames(route, 'guard');    // → ['auth']
 * resolveHookNames(route, 'unmount');  // → ['cleanup'] when unmount="cleanup"
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
