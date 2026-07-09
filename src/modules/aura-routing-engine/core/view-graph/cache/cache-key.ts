import type { MatchedRouteInfo } from '../../match/url-matcher';
import { routeMatchKey } from '../../route-tree/matched-chain';
import type { ViewDescriptor } from '../types';

/** `{location}|{query?}|{data?}|{loader}:{ref}[::{extract}]` */
export function payloadCacheKey(
  descriptor: ViewDescriptor,
  routeInfo: MatchedRouteInfo,
  options: { data?: unknown } = {},
): string {
  const parts: string[] = [];

  if (routeInfo.pathname) {
    parts.push(routeInfo.pathname);
  } else {
    parts.push(routeMatchKey(routeInfo));
    const params = encodeParams(routeInfo.params);
    if (params) parts.push(params);
  }

  const query = encodeParams(routeInfo.query);
  if (query) parts.push(query);

  if (options.data !== undefined) {
    parts.push(`d:${encodeURIComponent(JSON.stringify(options.data, sortObjectKeys))}`);
  }

  const slot = `${descriptor.loader}:${descriptor.ref}`;
  parts.push(descriptor.extract ? `${slot}::${descriptor.extract}` : slot);
  return parts.join('|');
}

function encodeParams(record: Record<string, string> | undefined): string {
  if (!record) return '';

  const keys = Object.keys(record).sort();
  if (!keys.length) return '';

  let encoded = '';
  for (const key of keys) {
    const value = record[key];
    if (value == null) continue;
    if (encoded) encoded += '&';
    encoded += `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
  return encoded;
}

function sortObjectKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    sorted[key] = (value as Record<string, unknown>)[key];
  }
  return sorted;
}
