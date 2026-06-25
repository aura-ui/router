import type { MatchedRouteInfo, RouteInfo } from '../../aura-route-hooks/core';

/** URL slice used to build a keep-alive stash key (`pathname` + optional `query`). */
export type ViewCacheKeyInput = {
  pathname: string;
  query?: Record<string, string>;
};

export type ViewCacheKeySource = ViewCacheKeyInput | MatchedRouteInfo | RouteInfo | undefined;

/** Maps lifecycle / matcher navigation data to a {@link ViewCacheKeyInput}. */
export function toViewCacheKeyInput(source: ViewCacheKeySource): ViewCacheKeyInput | undefined {
  if (!source) return undefined;

  if ('href' in source) {
    return {
      pathname: source.pathname,
      ...(source.query && { query: source.query }),
    };
  }

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
export function buildViewCacheKey(input: ViewCacheKeyInput | undefined, fallbackPath: string): string {
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
