import type { MatchedRouteInfo } from './url-matcher';

/**
 * `data:{pattern}|{params?}|{query?}`
 * Params/query sorted; omitted when empty.
 */
export function dataKey(match: MatchedRouteInfo): string {
  return `data:${identity(match)}`;
}

/**
 * `view:{pattern}|{params?}|{query?}|{slot}` — slot as in ViewGraph descriptor.
 * Optional `data` appends `|d:…` at the end (for needsData loads).
 * `null` when route has no layout/view content.
 */
export function viewKey(match: MatchedRouteInfo, data?: unknown): string | null {
  const slot = viewSlot(match);
  if (!slot) return null;

  let key = `view:${identity(match)}|${slot}`;
  if (data !== undefined) {
    key += `|d:${encodeURIComponent(JSON.stringify(data, sortKeys))}`;
  }
  return key;
}

function identity(match: MatchedRouteInfo): string {
  const parts = [match.node?.pattern ?? match.pattern];
  const params = encode(match.params);
  if (params) parts.push(params);
  const query = encode(match.query);
  if (query) parts.push(query);
  return parts.join('|');
}

function viewSlot(match: MatchedRouteInfo): string | null {
  const route = match.route as {
    layout?: string;
    view?: { loader: string; content: string } | null;
    extract?: string | null;
  };

  const layout = route.layout?.trim();
  if (layout) return `layout:template:${layout}`;

  const view = route.view;
  if (!view?.loader || !view.content) return null;

  const slot = `view:${view.loader}:${view.content}`;
  return view.loader === 'url' && route.extract ? `${slot}::${route.extract}` : slot;
}

function encode(record: Record<string, string> | undefined): string {
  if (!record) return '';
  return Object.keys(record)
    .sort()
    .filter((key) => record[key] != null)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(record[key]!)}`)
    .join('&');
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    sorted[key] = (value as Record<string, unknown>)[key];
  }
  return sorted;
}
