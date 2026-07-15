import { memoize } from '../../../aura-utils/decorators/memoize';
import { parseSearch } from '../../../aura-utils/misc/url';
import { isGlobalCatchAllPattern, isScopedCatchAllPattern } from '../route-tree/resolve-pattern';
import { attachNavigationChain, getActiveChain } from '../route-tree/matched-chain';
import { resourceKeys } from './resource-keys';
import { isStaticRoutePattern } from './route-score';
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
  /** Resource identity for DataGraph / handoff — set in {@link AuraRoutingUrlMatcher.toRouteInfo}. */
  dataKey?: string;
  /**
   * Base view resource identity (no `d:data`) — set in {@link AuraRoutingUrlMatcher.toRouteInfo}.
   * For needsData loads use {@link viewKeyWithData}.
   * `null` when no layout/view.
   */
  viewKey?: string | null;
}

/** Результат `matchPath`: победивший узел и path params. */
export interface NodePathMatch {
  node: RouteNode;
  params: Record<string, string>;
}

/** Declarative 404: `<aura-route path="*">` (global) or nested `path="*"` → `/prefix/*`. */
export const CATCH_ALL_SEGMENT = '*' as const;

/** exact = static O(1); rest = `:param` / catch-all. */
interface MatchableRoutes {
  exact: Map<string, RouteNode>;
  rest: readonly RouteNode[];
}

/**
 * Сопоставление pathname с маршрутами.
 * Кэши: memoize `matchPath`, `URLPattern`, разбиение nodes. Сброс — {@link destroy}.
 */
export class AuraRoutingUrlMatcher {
  private readonly urlPatterns = new Map<string, URLPattern>();
  private readonly routesByNodes = new WeakMap<readonly RouteNode[], MatchableRoutes>();

  /**
   * Лучший match среди `matchableNodes`.
   * Static hit — база; dynamic побеждает только при **большем** `matchScore`
   * (при равенстве static остаётся). Memoize по pathname → после смены tree: {@link destroy}.
   */
  @memoize((pathname: string) => pathname)
  matchPath(pathname: string, nodes: readonly RouteNode[]): NodePathMatch | null {
    const { exact, rest } = this.matchableRoutes(nodes);

    let bestNode = exact.get(pathname) ?? null;
    let bestParams: Record<string, string> = {};
    let bestScore = bestNode?.matchScore ?? -Infinity;

    for (const node of rest) {
      const params = this.getPathParams(pathname, node.pattern);
      if (params === null || node.matchScore <= bestScore) continue;
      bestNode = node;
      bestParams = params;
      bestScore = node.matchScore;
    }

    return bestNode ? { node: bestNode, params: bestParams } : null;
  }

  /**
   * Params для `(pathname, pattern)`, или `null`.
   * Порядок: global `*` → scoped `/*` → static `===` → `:param`.
   */
  getPathParams(pathname: string, pattern: string): Record<string, string> | null {
    if (isGlobalCatchAllPattern(pattern)) {
      return { splat: pathname.startsWith('/') ? pathname.slice(1) : pathname };
    }

    if (isScopedCatchAllPattern(pattern)) {
      return matchScopedCatchAll(pathname, pattern);
    }

    if (isStaticRoutePattern(pattern)) {
      return pathname === pattern ? {} : null;
    }

    return this.matchParamPattern(pathname, pattern);
  }

  destroy() {
    memoize.clear(this, 'matchPath');
    this.urlPatterns.clear();
  }

  /**
   * Leaf {@link MatchedRouteInfo} + nested `chain` из `node.branch`.
   * Ancestor params — {@link getPathParams}; keys — {@link resourceKeys}.
   */
  toRouteInfo(
    href: string,
    pathname: string,
    search: string,
    hash: string,
    node: RouteNode,
    params?: Record<string, string>,
  ): MatchedRouteInfo {
    const leaf = attachNavigationChain(
      node,
      {
        href,
        pathname,
        search,
        hash,
        params,
        query: parseSearch(search),
      },
      (targetPathname, targetPattern) => this.getPathParams(targetPathname, targetPattern),
    );

    for (const info of getActiveChain(leaf)) {
      const keys = resourceKeys(info);
      info.dataKey = keys.dataKey;
      info.viewKey = keys.viewKey;
    }

    return leaf;
  }

  private matchableRoutes(nodes: readonly RouteNode[]): MatchableRoutes {
    const cached = this.routesByNodes.get(nodes);
    if (cached) return cached;

    const exact = new Map<string, RouteNode>();
    const rest: RouteNode[] = [];
    for (const node of nodes) {
      if (isStaticRoutePattern(node.pattern)) exact.set(node.pattern, node);
      else rest.push(node);
    }

    const routes = { exact, rest };
    this.routesByNodes.set(nodes, routes);
    return routes;
  }

  private matchParamPattern(pathname: string, pattern: string): Record<string, string> | null {
    try {
      const result = this.getUrlPattern(pattern).exec({ pathname });
      if (!result) return null;

      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(result.pathname.groups)) {
        if (value !== undefined) params[key] = value;
      }
      return params;
    } catch {
      return pathname === pattern ? {} : null;
    }
  }

  private getUrlPattern(pattern: string): URLPattern {
    let compiled = this.urlPatterns.get(pattern);
    if (!compiled) {
      compiled = new URLPattern({ pathname: pattern });
      this.urlPatterns.set(pattern, compiled);
    }
    return compiled;
  }
}

/** Scoped `/users/*`: `/users/unknown` → `{ splat: 'unknown' }`. */
function matchScopedCatchAll(pathname: string, pattern: string): Record<string, string> | null {
  const prefix = pattern.slice(0, -1); // `/users/*` → `/users/`
  if (!pathname.startsWith(prefix)) return null;
  const splat = pathname.slice(prefix.length);
  return splat ? { splat } : null;
}

export {
  computeMatchScore,
  isCatchAllRoute,
  isParamRoutePattern,
  isStaticRoutePattern,
} from './route-score';
