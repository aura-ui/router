import type { MatchedRouteInfo, RouteInfo } from '../../../aura-route-hooks/core';

export type ViewCacheKeySource = MatchedRouteInfo | RouteInfo | undefined;

/** Maps lifecycle / matcher navigation data to pathname + optional query. */
export function toViewCacheKeyInput(
  source: ViewCacheKeySource,
): Pick<RouteInfo, 'pathname'> & Partial<Pick<RouteInfo, 'query'>> | undefined {
  if (!source) return undefined;

  return {
    pathname: source.pathname,
    ...(source.query && { query: source.query }),
  };
}

/**
 * Stable keep-alive key for a detached view.
 *
 * Base: `input.pathname` (browser pathname) → `fallbackPath` (route attr when no input).
 * Query is appended when present.
 */
export function buildViewCacheKey(
  input: Pick<RouteInfo, 'pathname'> & Partial<Pick<RouteInfo, 'query'>> | undefined,
  fallbackPath: string,
): string {
  const base = input?.pathname ?? fallbackPath;
  const parts = [base];

  if (input?.query && Object.keys(input.query).length > 0) {
    parts.push(serializeRecord(input.query));
  }

  return parts.join('|');
}

function serializeRecord(record: Record<string, string>): string {
  return Object.keys(record)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(record[key]!)}`)
    .join('&');
}

/** Builds a stash key from navigation context and route attr fallback. */
export function viewCacheKey(source: ViewCacheKeySource, fallbackPath: string): string {
  return buildViewCacheKey(toViewCacheKeyInput(source), fallbackPath);
}
