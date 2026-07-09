import type { MatchedRouteInfo } from '../../match/url-matcher';
import { routeMatchKey } from '../../route-tree/matched-chain';
import type { ContentDescriptor } from '../model/types';

export type PayloadCacheKeyOptions = {
  /** Load-hook payload fingerprint — required when markup depends on `data`. */
  readonly data?: unknown;
};

/**
 * Payload cache key layout:
 *   {location}|{query?}|{data?}|{loader}:{ref}[::{extract}]
 *
 * `location` is pathname, or `pattern|params` when pathname is absent.
 */
export function payloadCacheKey(
  descriptor: ContentDescriptor,
  routeInfo: MatchedRouteInfo,
  options: PayloadCacheKeyOptions = {},
): string {
  const parts: string[] = [];

  if (routeInfo.pathname) {
    parts.push(routeInfo.pathname);
  } else {
    parts.push(routeMatchKey(routeInfo));
    appendEncodedRecord(parts, routeInfo.params);
  }

  appendEncodedRecord(parts, routeInfo.query);

  if (options.data !== undefined) {
    parts.push(`d:${dataSegment(options.data)}`);
  }

  parts.push(loaderSlot(descriptor));
  return parts.join('|');
}

function appendEncodedRecord(parts: string[], record?: Record<string, string>): void {
  const encoded = encodeParams(record);
  if (encoded) parts.push(encoded);
}

function loaderSlot(descriptor: ContentDescriptor): string {
  const base = `${descriptor.loader}:${descriptor.ref}`;
  return descriptor.extract ? `${base}::${descriptor.extract}` : base;
}

/** Sorted `key=value&…` segment; skips nullish values. */
function encodeParams(record: Record<string, string> | undefined): string {
  if (!record) return '';

  const keys = Object.keys(record);
  if (!keys.length) return '';

  keys.sort();

  let encoded = '';
  for (const key of keys) {
    const value = record[key];
    if (value == null) continue;
    if (encoded) encoded += '&';
    encoded += `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }

  return encoded;
}

function dataSegment(data: unknown): string {
  return encodeURIComponent(JSON.stringify(data, sortObjectKeys));
}

/** JSON replacer — stable object key order at every nesting level. */
function sortObjectKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    sorted[key] = (value as Record<string, unknown>)[key];
  }
  return sorted;
}
