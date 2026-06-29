import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { ContentDescriptor } from '../model/types';

/** Stable content-cache key: URL identity + loader + ref. */
export function contentCacheKey(
  descriptor: ContentDescriptor,
  routeInfo: MatchedRouteInfo,
): string {
  const base = routeInfo.pathname ?? routeInfo.pattern;
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
