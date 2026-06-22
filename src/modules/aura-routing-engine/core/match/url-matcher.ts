import type { AURARoute } from '../../../aura-route/core/aura-route';
import { parsePath, parseQuery } from '../../../aura-utils/misc/url';
import {
  isGlobalCatchAllFullPath,
  isScopedCatchAllFullPath,
} from '../route-tree/resolve-full-path';
import { attachNavigationChain } from '../route-tree';
import type { RouteNode } from '../route-tree';

export interface MatchedRouteInfo {
  /** Resolved URL pathname, e.g. `/user/42`. */
  url: string;
  pathname: string;
  search: string;
  hash: string;
  /** Registered route pattern, e.g. `/user/:id`. */
  routePath: string;
  route: AURARoute;
  /** Path params: `:id` из URLPattern; catch-all `*` → `{ splat: 'foo/bar' }`. */
  params?: Record<string, string>;
  query?: Record<string, string>;
  /** Узел в route tree. */
  node?: RouteNode;
  /** Active branch root → leaf. */
  chain?: MatchedRouteInfo[];
}

export interface NodePathMatch {
  node: RouteNode;
  params: Record<string, string>;
}

/** Declarative 404: `<aura-route path="*">` (global) or nested `path="*"` → `/prefix/*`. */
export const CATCH_ALL_ROUTE_PATH = '*' as const;

/** Global catch-all — lowest match priority. */
const SCORE_GLOBAL_CATCH_ALL = -1;

/** Scoped `*` ranks below a static sibling at the same segment depth. */
const SCORE_SCOPED_CATCH_ALL_DEPTH_BIAS = 0.5;

export function isCatchAllRoute(fullPath: string): boolean {
  return isGlobalCatchAllFullPath(fullPath) || isScopedCatchAllFullPath(fullPath);
}

function routeScore(fullPath: string): number {
  if (isGlobalCatchAllFullPath(fullPath)) return SCORE_GLOBAL_CATCH_ALL;
  if (isScopedCatchAllFullPath(fullPath)) {
    const prefix = fullPath.slice(0, -2);
    return prefix.split('/').filter(Boolean).length - SCORE_SCOPED_CATCH_ALL_DEPTH_BIAS;
  }
  return fullPath.split('/').filter(Boolean).length;
}

export class AuraRoutingUrlMatcher {
  /** Match pathname по matchable nodes registry (nested-ready). */
  matchPath(pathname: string, nodes: readonly RouteNode[]): NodePathMatch | null {
    let best: NodePathMatch & { score: number } | null = null;

    for (const node of nodes) {
      const params = this.getPathParams(pathname, node.fullPath);
      if (params === null) continue;
      const score = routeScore(node.fullPath);
      if (!best || score > best.score) {
        best = { node, params, score };
      }
    }

    return best ? { node: best.node, params: best.params } : null;
  }

  /**
   * Path params для pattern: `:id` через URLPattern, catch-all — ключ `splat`.
   *
   * **splat** — не engine fallback при «маршрут не найден», а param зарегистрированного
   * `<aura-route path="*">`. Без `*` matchPath → null, splat не будет (см. notFoundHandler).
   *
   * @example global `*` — `/foo/bar` → `{ splat: 'foo/bar' }`
   * @example scoped `/users/*` — `/users/unknown` → `{ splat: 'unknown' }`
   */
  getPathParams(pathname: string, routePath: string): Record<string, string> | null {
    if (isGlobalCatchAllFullPath(routePath)) {
      const splat = pathname.replace(/^\//, '');
      return { splat };
    }

    if (isScopedCatchAllFullPath(routePath)) {
      return matchScopedCatchAll(pathname, routePath);
    }

    try {
      const urlPattern = new URLPattern({ pathname: routePath });
      const result = urlPattern.exec({ pathname });
      if (!result) return null;

      const groups: Record<string, string> = {};
      for (const [key, value] of Object.entries(result.pathname.groups)) {
        if (value !== undefined) groups[key] = value;
      }

      return groups;
    } catch {
      return pathname === routePath ? {} : null;
    }
  }

  /** MatchedRouteInfo leaf + `chain` из node.branch. */
  toRouteInfo(
    url: string,
    pathname: string,
    search: string,
    hash: string,
    node: RouteNode,
    params?: Record<string, string>,
  ): MatchedRouteInfo {
    const query = parseQuery(search);

    return attachNavigationChain(
      node,
      {
        url,
        pathname,
        search,
        hash,
        ...(params && Object.keys(params).length > 0 && { params }),
        ...(query && Object.keys(query).length > 0 && { query }),
      },
      (targetPathname, fullPath) => this.getPathParams(targetPathname, fullPath),
    );
  }

  /** Только смена #якоря на том же path — без полного transition. */
  isHashOnly(href: string, currentHref: string): boolean {
    const next = parsePath(href);
    const current = parsePath(currentHref);
    const sameRoute = next.pathname === current.pathname && next.search === current.search;
    return Boolean(sameRoute && next.hash && next.hash !== current.hash);
  }
}

/**
 * Scoped catch-all: nested `path="*"` → `/users/*`.
 * splat — остаток pathname после prefix. Пример: `/users/unknown` → `{ splat: 'unknown' }`.
 */
function matchScopedCatchAll(pathname: string, routePath: string): Record<string, string> | null {
  const prefix = routePath.slice(0, -2);
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`;
  if (!pathname.startsWith(prefixWithSlash)) return null;

  const splat = pathname.slice(prefixWithSlash.length);
  if (!splat) return null;

  return { splat };
}
