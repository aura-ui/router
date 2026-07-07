import { resolveHookNames } from '../hooks/resolve-hook-names';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { routeMatchKey } from '../route-tree/matched-chain';

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

/** Cache key for one route's load-hook payload (matches {@link DataGraph} store). */
export function buildRouteDataKey(
  route: MatchedRouteInfo,
  hookNames: readonly string[],
): string {
  const parts = [routeMatchKey(route), hookNames.join(',')];

  if (route.params && Object.keys(route.params).length) {
    parts.push(encodeRecord(route.params));
  }

  if (route.query && Object.keys(route.query).length) {
    parts.push(encodeRecord(route.query));
  }

  return parts.join('|');
}

/** Lookup load-hook payload for a route in a navigation snapshot. */
export function resolveRouteData(
  snapshot: ReadonlyMap<string, unknown>,
  route: MatchedRouteInfo,
): unknown | undefined {
  const hookNames = routeLoadHookNames(route);
  if (!hookNames) return undefined;

  const key = buildRouteDataKey(route, hookNames);
  if (!snapshot.has(key)) return undefined;

  return snapshot.get(key);
}

function encodeRecord(record: Record<string, string>): string {
  return Object.keys(record)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(record[key]!)}`)
    .join('&');
}
