import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { ContentDescriptor } from '../model/types';

/** Stable payload cache key: `{path}|{query}|{loader}:{ref}` or with `::{extract}`. */
export function payloadCacheKey(descriptor: ContentDescriptor, routeInfo: MatchedRouteInfo): string {
  const path = routeInfo.pathname ?? routeInfo.pattern;
  const slot = descriptor.extract
    ? `${descriptor.loader}:${descriptor.ref}::${descriptor.extract}`
    : `${descriptor.loader}:${descriptor.ref}`;

  const query = routeInfo.query;
  if (!query) return `${path}|${slot}`;

  const keys = Object.keys(query);
  if (keys.length === 0) return `${path}|${slot}`;

  keys.sort();

  const parts: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const value = query[key];
    if (value == null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }

  if (parts.length === 0) return `${path}|${slot}`;

  return `${path}|${parts.join('&')}|${slot}`;
}
