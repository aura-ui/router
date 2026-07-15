import { resolveHookNames } from '../hooks/resolve-hook-names';
import type { MatchedRouteInfo } from '../match/url-matcher';

/** Resolved `load` hook names for a route, or `null` when the phase is inactive. */
export function routeLoadHookNames(
  route: MatchedRouteInfo,
): readonly string[] | null {
  return resolveHookNames(route.route, 'load');
}

/** Whether the route participates in DataGraph load / snapshot. */
export function routeHasLoadHooks(route: MatchedRouteInfo): boolean {
  return route.route.hasLoad;
}

/** Lookup load-hook payload for a route in a navigation snapshot. */
export function resolveRouteData(
  snapshot: ReadonlyMap<string, unknown>,
  route: MatchedRouteInfo,
): unknown | undefined {
  if (!routeLoadHookNames(route)) return undefined;

  const key = route.dataKey;
  if (key == null || !snapshot.has(key)) return undefined;

  return snapshot.get(key);
}

/** Nearest ancestor on `branch` (root→leaf) that participates in DataGraph load. */
export function closestRouteWithLoadHooks(
  child: MatchedRouteInfo,
  branch: readonly MatchedRouteInfo[],
): MatchedRouteInfo | undefined {
  const childUid = child.route.uid;
  const childIndex = branch.findIndex((route) => route.route.uid === childUid);
  if (childIndex <= 0) return undefined;

  for (let i = childIndex - 1; i >= 0; i--) {
    const ancestor = branch[i]!;
    if (ancestor.route.hasLoad) return ancestor;
  }
  return undefined;
}
