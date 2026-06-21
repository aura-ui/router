const CATCH_ALL_SEGMENT = new Set(['*', '/*']);
const SCOPED_CATCH_ALL_SUFFIX = '/*';

/**
 * Склеивает `routePath` (attr path) с fullPath родителя в итоговый URL-паттерн.
 * @example resolveFullPath('/settings', 'profile') → '/settings/profile'
 * @example resolveFullPath('/settings', '/users') → '/users' (absolute child)
 * @example resolveFullPath('/settings', '') → '/settings' (index child)
 * @example resolveFullPath('/users', '*') → '/users/*' (scoped catch-all)
 * @example resolveFullPath(null, '*') → '*' (global catch-all)
 */
export function resolveFullPath(parentFullPath: string | null, routePath: string): string {
  if (CATCH_ALL_SEGMENT.has(routePath)) {
    if (!parentFullPath || parentFullPath === '/') return '*';
    return normalizePath(`${trimTrailingSlash(parentFullPath)}${SCOPED_CATCH_ALL_SUFFIX}`);
  }

  //index path
  if (routePath === '') {
    return parentFullPath ?? '/';
  }

  //absolute path
  if (routePath.startsWith('/')) {
    return normalizePath(routePath);
  }

  //relative path
  const base = parentFullPath ?? '';
  if (!base || base === '/') {
    return normalizePath(`/${routePath}`);
  }

  return normalizePath(`${trimTrailingSlash(base)}/${routePath}`);
}

/** Глобальный catch-all: `<aura-route path="*">` на корне. */
export function isGlobalCatchAllFullPath(fullPath: string): boolean {
  return fullPath === '*' || fullPath === '/*';
}

/** Scoped catch-all внутри ветки: `/users/*`, не матчит URL вне prefix. */
export function isScopedCatchAllFullPath(fullPath: string): boolean {
  return fullPath.endsWith(SCOPED_CATCH_ALL_SUFFIX) && !isGlobalCatchAllFullPath(fullPath);
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
