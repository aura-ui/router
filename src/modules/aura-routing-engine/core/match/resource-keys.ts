import type { MatchedRouteInfo } from './url-matcher';

/**
 * `data:{pattern}|{params?}|{query?}`
 * Params/query sorted; omitted when empty.
 */
export function dataKey(match: MatchedRouteInfo): string {
  return `data:${identity(match)}`;
}

/**
 * Base view identity (no load payload): `view:{pattern}|{params?}|{query?}|{slot}`.
 * Stored on {@link MatchedRouteInfo.viewKey} at match time.
 * `null` when route has no layout/view content.
 */
export function viewKey(match: MatchedRouteInfo): string | null {
  const suffix = match.route.viewKeySuffix;
  if (!suffix) return null;
  return `view:${identity(match)}|${suffix}`;
}

/**
 * Both resource keys with a single identity encode (hot path in `buildMatchedRouteInfo`).
 */
export function resourceKeys(match: MatchedRouteInfo): {
  dataKey: string;
  viewKey: string | null;
} {
  const id = identity(match);
  const suffix = match.route.viewKeySuffix;
  return {
    dataKey: `data:${id}`,
    viewKey: suffix ? `view:${id}|${suffix}` : null,
  };
}

/**
 * Enrich a precomputed {@link viewKey} / `match.viewKey` with load-hook data.
 * Does not rebuild identity/slot — only appends `|d:…`.
 */
export function viewKeyWithData(base: string, data: unknown): string {
  return `${base}|d:${encodeURIComponent(JSON.stringify(data, sortKeys))}`;
}

function identity(match: MatchedRouteInfo): string {
  let out = match.node?.pattern ?? match.pattern;
  const params = encode(match.params);
  if (params) out += `|${params}`;
  const query = encode(match.query);
  if (query) out += `|${query}`;
  return out;
}

function encode(record: Record<string, string> | undefined): string {
  if (!record) return '';

  const keys = Object.keys(record);
  const n = keys.length;
  if (!n) return '';
  if (n > 1) keys.sort();

  let encoded = '';
  for (let i = 0; i < n; i++) {
    const key = keys[i]!;
    const value = record[key];
    if (value == null) continue;
    if (encoded) encoded += '&';
    encoded += `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
  return encoded;
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    sorted[key] = (value as Record<string, unknown>)[key];
  }
  return sorted;
}
