const CATCH_ALL_SEGMENT = new Set(['*', '/*']);
const SCOPED_CATCH_ALL_SUFFIX = '/*';

/** Index child alias: `path="."` → `""`. */
export function normalizeRouteSegment(segment: string): string {
  return segment === '.' ? '' : segment;
}

/**
 * Склеивает `segment` (attr `path`) с pattern родителя в итоговый URL-паттерн.
 * @example resolvePattern('/settings', 'profile') → '/settings/profile'
 * @example resolvePattern('/settings', '/users') → '/users' (absolute child)
 * @example resolvePattern('/settings', '') → '/settings' (index child)
 * @example resolvePattern('/settings', '.') → '/settings' (index alias)
 * @example resolvePattern('/users', '*') → '/users/*' (scoped catch-all)
 * @example resolvePattern(null, '*') → '*' (global catch-all)
 */
export function resolvePattern(parentPattern: string | null, segment: string): string {
  segment = normalizeRouteSegment(segment);

  if (CATCH_ALL_SEGMENT.has(segment)) {
    if (!parentPattern || parentPattern === '/') return '*';
    return normalizePath(`${trimTrailingSlash(parentPattern)}${SCOPED_CATCH_ALL_SUFFIX}`);
  }

  // index path
  if (segment === '') {
    return parentPattern ?? '/';
  }

  // absolute path
  if (segment.startsWith('/')) {
    return normalizePath(segment);
  }

  // relative path
  const base = parentPattern ?? '';
  if (!base || base === '/') {
    return normalizePath(`/${segment}`);
  }

  return normalizePath(`${trimTrailingSlash(base)}/${segment}`);
}

/** Глобальный catch-all: `<aura-route path="*">` на корне. */
export function isGlobalCatchAllPattern(pattern: string): boolean {
  return pattern === '*' || pattern === '/*';
}

/** Scoped catch-all внутри ветки: `/users/*`, не матчит URL вне prefix. */
export function isScopedCatchAllPattern(pattern: string): boolean {
  return pattern.endsWith(SCOPED_CATCH_ALL_SUFFIX) && !isGlobalCatchAllPattern(pattern);
}

/** Убирает лишние слэши и trailing `/` (кроме корня `/`). @example '//a//b/' → '/a/b' */
function normalizePath(path: string): string {
  const collapsed = path.replace(/\/{2,}/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1);
  }
  return collapsed || '/';
}

/** @example '/settings/' → '/settings', '/' → '/' */
function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}
