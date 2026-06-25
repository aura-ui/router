import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';
import type { ContentDescriptor } from './types';

/** Stable content-cache key: URL identity + loader + ref. */
export function contentCacheKey(
  descriptor: ContentDescriptor,
  routeInfo: MatchedRouteInfo,
  fallbackPath: string,
): string {
  const base = routeInfo.pathname ?? fallbackPath;
  const identity = `${descriptor.loader}:${descriptor.ref}`;
  const query = routeInfo.query;

  if (!query || Object.keys(query).length === 0) {
    return `${base}|${identity}`;
  }

  const qs = Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key]!)}`)
    .join('&');

  return `${base}|${qs}|${identity}`;
}
