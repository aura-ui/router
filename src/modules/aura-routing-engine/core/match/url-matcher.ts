import { memoize } from '../../../aura-utils/decorators/memoize';
import { parsePath, parseQuery } from '../../../aura-utils/misc/url';
import { isGlobalCatchAllPattern, isScopedCatchAllPattern } from '../route-tree/resolve-pattern';
import { attachNavigationChain } from '../route-tree/matched-chain';
import type { AuraRoute } from '../../../aura-route/core/aura-route';
import type { ResolvedView } from '../route-tree/resolved-view';
import type { RouteNode } from '../route-tree/route-node.types';

export interface MatchedRouteInfo {
  /** Relative browser href: `pathname + search + hash`, e.g. `/user/42?q=1#tab`. */
  href: string;
  /** Browser pathname without `search` / `hash`, e.g. `/user/42`. */
  pathname: string;
  search: string;
  hash: string;
  /** Resolved route pattern in the tree (`node.pattern`). May include `:param` segments, e.g. `/user/:id`. */
  pattern: string;
  route: AuraRoute;
  /** Path params: `:id` из URLPattern; catch-all `*` → `{ splat: 'foo/bar' }`. */
  params?: Record<string, string>;
  query?: Record<string, string>;
  /** Узел в route tree. */
  node?: RouteNode;
  /** Active branch root → leaf. */
  chain?: MatchedRouteInfo[];
  /** Resolved `view` attr for this navigation (leaf); set in {@link attachNavigationChain}. */
  resolvedView?: ResolvedView | null;
}

export interface NodePathMatch {
  node: RouteNode;
  params: Record<string, string>;
}

/** Declarative 404: `<aura-route path="*">` (global) or nested `path="*"` → `/prefix/*`. */
export const CATCH_ALL_SEGMENT = '*' as const;

/** Global catch-all — lowest match priority. */
const SCORE_GLOBAL_CATCH_ALL = -1;

/** Scoped `*` ranks below a static sibling at the same segment depth. */
const SCORE_SCOPED_CATCH_ALL_DEPTH_BIAS = 0.5;

export function isCatchAllRoute(pattern: string): boolean {
  return isGlobalCatchAllPattern(pattern) || isScopedCatchAllPattern(pattern);
}

function routeScore(pattern: string): number {
  if (isGlobalCatchAllPattern(pattern)) return SCORE_GLOBAL_CATCH_ALL;
  if (isScopedCatchAllPattern(pattern)) {
    const prefix = pattern.slice(0, -2);
    return prefix.split('/').filter(Boolean).length - SCORE_SCOPED_CATCH_ALL_DEPTH_BIAS;
  }
  return pattern.split('/').filter(Boolean).length;
}

export class AuraRoutingUrlMatcher {
  /** Match pathname по matchable nodes registry (nested-ready). */
  @memoize((pathname: string) => pathname)
  matchPath(pathname: string, nodes: readonly RouteNode[]): NodePathMatch | null {
    let best: NodePathMatch & { score: number } | null = null;

    for (const node of nodes) {
      const params = this.getPathParams(pathname, node.pattern);
      if (params === null) continue;
      const score = routeScore(node.pattern);
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
  @memoize((pathname, pattern) => `${pathname}\0${pattern}`)
  getPathParams(pathname: string, pattern: string): Record<string, string> | null {
    if (isGlobalCatchAllPattern(pattern)) {
      const splat = pathname.replace(/^\//, '');
      return { splat };
    }

    if (isScopedCatchAllPattern(pattern)) {
      return matchScopedCatchAll(pathname, pattern);
    }

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

  /** Drops memoized `matchPath` / `getPathParams` caches (e.g. when route tree changes). */
  destroy() {
    memoize.clear(this, 'matchPath');
    memoize.clear(this, 'getPathParams');
  }

  /** MatchedRouteInfo leaf + `chain` из node.branch. */
  toRouteInfo(
    href: string,
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
        href,
        pathname,
        search,
        hash,
        ...(params && Object.keys(params).length > 0 && { params }),
        ...(query && Object.keys(query).length > 0 && { query }),
      },
      (targetPathname, targetPattern) => this.getPathParams(targetPathname, targetPattern),
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
function matchScopedCatchAll(pathname: string, pattern: string): Record<string, string> | null {
  const prefix = pattern.slice(0, -2);
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`;
  if (!pathname.startsWith(prefixWithSlash)) return null;

  const splat = pathname.slice(prefixWithSlash.length);
  if (!splat) return null;

  return { splat };
}
