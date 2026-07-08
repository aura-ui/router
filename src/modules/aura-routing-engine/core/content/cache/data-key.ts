import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { ContentDescriptor } from '../model/types';

/**
 * Stable data-cache key for a resolved content descriptor.
 *
 * `{path}|{loader}:{ref}` — no query, no extract
 * `{path}|{query}|{loader}:{ref}` — with search params (sorted)
 * `{path}|{loader}:{ref}::{extract}` — url loader fragment extract
 */
export function dataCacheKey(descriptor: ContentDescriptor, routeInfo: MatchedRouteInfo): string {
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
