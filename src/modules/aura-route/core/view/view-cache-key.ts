import type { MatchedRouteInfo, RouteInfo } from '../../../aura-route-hooks/core';

type ViewCacheKeySource = MatchedRouteInfo | RouteInfo | undefined;

/**
 * Stable keep-alive stash key.
 * Base: `source.pathname` → `fallbackPath` (route attr). Query appended when present.
 */
export function viewCacheKey(source: ViewCacheKeySource, fallbackPath: string): string {
  const base = source?.pathname ?? fallbackPath;
  const query = source?.query;

  if (!query || Object.keys(query).length === 0) {
    return base;
  }

  return `${base}|${serializeQuery(query)}`;
}

// todo move to utils
function serializeQuery(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key]!)}`)
    .join('&');
}
