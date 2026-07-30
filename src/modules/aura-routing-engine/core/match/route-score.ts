import { isGlobalCatchAllPattern, isScopedCatchAllPattern } from '../route-tree/resolve-pattern';

/** Есть `:param` → нужен `URLPattern`. */
export function isParamRoutePattern(pattern: string): boolean {
  return pattern.includes(':');
}

/** Global (`*`) или scoped (`/prefix/*`). */
export function isCatchAllRoutePattern(pattern: string): boolean {
  return isGlobalCatchAllPattern(pattern) || isScopedCatchAllPattern(pattern);
}

/** Exact pathname; без `:param` и без `*`. */
export function isStaticRoutePattern(pattern: string): boolean {
  return !isParamRoutePattern(pattern) && !isCatchAllRoutePattern(pattern);
}

/**
 * Приоритет match → `RouteNode.matchScore`.
 * Больше сегментов → выше; scoped `/*` −0.5; global `*` → −1.
 *
 * @example `/settings/profile` → 2; `/users/*` → 1.5; `*` → −1
 */
export function computeMatchScore(pattern: string): number {
  if (isGlobalCatchAllPattern(pattern)) return -1;
  if (isScopedCatchAllPattern(pattern)) {
    // `/users/*` чуть ниже static sibling той же глубины
    return pattern.slice(0, -2).split('/').filter(Boolean).length - 0.5;
  }
  return pattern.split('/').filter(Boolean).length;
}
