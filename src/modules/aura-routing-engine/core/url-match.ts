import type { RouteMatch } from './types';

export function currentLocationPath(): string {
  return window.location.pathname;
}

export function parseQuery(search: string): Record<string, string> | undefined {
  if (!search || search === '?') return undefined;

  const params = Object.fromEntries(new URLSearchParams(search));
  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * Match pathname against an Express-style pattern using URLPattern.
 * Returns captured groups or null when no match.
 */
export function matchPattern(pathname: string, pattern: string): Record<string, string> | null {
  try {
    const urlPattern = new URLPattern({ pathname: pattern });
    const result = urlPattern.exec({ pathname });
    if (!result) return null;

    const groups: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.pathname.groups)) {
      if (value !== undefined) groups[key] = value;
    }

    return groups;
  } catch {
    return pathname === pattern ? {} : null;
  }
}

export function toRouteMatch(
  pathname: string,
  pattern: string,
  search = window.location.search,
): RouteMatch {
  const params = matchPattern(pathname, pattern) ?? undefined;
  const query = parseQuery(search);

  return {
    path: pathname + (search && search !== '?' ? search : ''),
    pattern,
    ...(params && Object.keys(params).length > 0 && { params }),
    ...(query && { query }),
  };
}

/** Pick the most specific matching pattern (longer pathname template wins). */
export function resolveBestMatch(
  pathname: string,
  patterns: Iterable<string>,
): { pattern: string; params: Record<string, string> } | null {
  let best: { pattern: string; params: Record<string, string>; score: number } | null = null;

  for (const pattern of patterns) {
    const params = matchPattern(pathname, pattern);
    if (params === null) continue;

    const score = pattern.split('/').filter(Boolean).length;
    if (!best || score > best.score) {
      best = { pattern, params, score };
    }
  }

  return best ? { pattern: best.pattern, params: best.params } : null;
}
