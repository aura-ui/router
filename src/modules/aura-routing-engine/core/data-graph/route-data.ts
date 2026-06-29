import { resolveHookNames } from '../lifecycle/bindings/route-hook-bindings';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { routeMatchKey } from '../route-tree/matched-chain';

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
  const hookNames = resolveHookNames(route.route, 'load');
  if (!hookNames?.length) return undefined;

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
