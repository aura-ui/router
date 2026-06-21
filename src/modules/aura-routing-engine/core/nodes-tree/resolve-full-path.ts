const CATCH_ALL = new Set(['*', '/*']);

/**
 * Склеивает segment `path` с fullPath родителя в итоговый URL-паттерн.
 * @example resolveFullPath('/settings', 'profile') → '/settings/profile'
 * @example resolveFullPath('/settings', '/users') → '/users' (absolute child)
 * @example resolveFullPath('/settings', '') → '/settings' (index child)
 */
export function resolveFullPath(parentFullPath: string | null, segmentPath: string): string {
  if (CATCH_ALL.has(segmentPath)) return '*';

  if (segmentPath === '') {
    return parentFullPath ?? '/';
  }

  if (segmentPath.startsWith('/')) {
    return normalizePath(segmentPath);
  }

  const base = parentFullPath ?? '';
  if (!base || base === '/') {
    return normalizePath(`/${segmentPath}`);
  }

  return normalizePath(`${trimTrailingSlash(base)}/${segmentPath}`);
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
