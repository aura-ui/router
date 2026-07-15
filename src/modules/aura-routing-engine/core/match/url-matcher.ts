import { memoize } from '../../../aura-utils/decorators/memoize';
import { parseSearch } from '../../../aura-utils/misc/url';
import { isGlobalCatchAllPattern, isScopedCatchAllPattern } from '../route-tree/resolve-pattern';
import { buildActiveChain, getActiveChain } from '../route-tree/matched-chain';
import { resourceKeys } from './resource-keys';
import { isStaticRoutePattern } from './route-score';
import type { AuraRoute } from '../../../aura-route/core/aura-route';
import type { ResolvedView } from '../route-tree/resolved-view';
import type { RouteNode } from '../route-tree/route-node.types';

/**
 * Result of matching a URL to a route (leaf + optional nested `chain`).
 * Built by {@link AuraRoutingUrlMatcher.buildMatchedRouteInfo}.
 */
export interface MatchedRouteInfo {
  /** Relative browser href: `pathname + search + hash`, e.g. `/user/42?q=1#tab`. */
  href: string;
  /** Browser pathname without `search` / `hash`, e.g. `/user/42`. */
  pathname: string;
  /** Raw `location.search` including `?`, or `''`. */
  search: string;
  /** Raw `location.hash` including `#`, or `''`. */
  hash: string;
  /** Resolved route pattern in the tree (`node.pattern`). May include `:param` segments, e.g. `/user/:id`. */
  pattern: string;
  /** Route element / config for this match. */
  route: AuraRoute;
  /**
   * Path params: `:id` from URLPattern; catch-all `*` → `{ splat: 'foo/bar' }`.
   * Omitted when empty.
   */
  params?: Record<string, string>;
  /**
   * Parsed search params via `parseSearch` (no leading `?`).
   * Set on the leaf only; omitted when empty / absent.
   */
  query?: Record<string, string>;
  /** Node in the route tree. */
  node?: RouteNode;
  /** Active branch root → leaf (same array shared by every entry). */
  chain?: MatchedRouteInfo[];
  /** Resolved `view` attr for this navigation (leaf); set in {@link buildActiveChain}. */
  resolvedView?: ResolvedView | null;
  /** Resource identity for DataGraph / handoff — set in {@link AuraRoutingUrlMatcher.buildMatchedRouteInfo}. */
  dataKey?: string;
  /**
   * Base view resource identity (no `d:data`) — set in {@link AuraRoutingUrlMatcher.buildMatchedRouteInfo}.
   * For needsData loads use `viewKeyWithData` from `./resource-keys`.
   * `null` when no layout/view.
   */
  viewKey?: string | null;
}

/**
 * Result of {@link AuraRoutingUrlMatcher.matchPath}: winning node and path params.
 */
export interface NodePathMatch {
  /** Best-scoring node among `matchableNodes`. */
  node: RouteNode;
  /** Path params for `node.pattern` against the matched pathname. */
  params: Record<string, string>;
}

/** Declarative 404: `<aura-route path="*">` (global) or nested `path="*"` → `/prefix/*`. */
export const CATCH_ALL_SEGMENT = '*' as const;

/**
 * Fast-path index: static O(1) map + dynamic candidates.
 * @see AuraRoutingUrlMatcher.getMatchIndex
 */
interface MatchIndex {
  /** `pattern → node` for static routes (`isStaticRoutePattern`). */
  exact: Map<string, RouteNode>;
  /** `:param` / catch-all nodes — probed via {@link AuraRoutingUrlMatcher.getPathParams}. */
  rest: readonly RouteNode[];
}

/**
 * Matches a pathname against route nodes.
 *
 * Public pipeline:
 * 1. {@link matchPath} — best node among `matchableNodes`
 * 2. {@link buildMatchedRouteInfo} — leaf + nested `chain` + resource keys
 *
 * Caches: memoized `matchPath`, compiled `URLPattern`, node index (`WeakMap`).
 * Call {@link destroy} after the route tree changes (memoize + `URLPattern`;
 * the WeakMap index is GC'd with the old `nodes` array).
 */
export class AuraRoutingUrlMatcher {
  /** Compiled `URLPattern` cache keyed by route `pattern`. */
  private readonly urlPatterns = new Map<string, URLPattern>();
  /** Static/dynamic split cache keyed by the `nodes` array identity. */
  private readonly matchIndexByNodes = new WeakMap<readonly RouteNode[], MatchIndex>();

  /**
   * Best match among `matchableNodes`.
   *
   * A static hit is the baseline; a dynamic candidate wins only with a **higher**
   * `matchScore` (on a tie the static match is kept).
   *
   * Memoized by pathname — call {@link destroy} after the route tree changes.
   *
   * @param pathname - Browser pathname (no search/hash).
   * @param nodes - Usually `routeTree.matchableNodes`.
   * @returns Winning node + params, or `null` if nothing matched.
   */
  @memoize((pathname: string) => pathname)
  matchPath(pathname: string, nodes: readonly RouteNode[]): NodePathMatch | null {
    const { exact, rest } = this.getMatchIndex(nodes);

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
   * Leaf {@link MatchedRouteInfo} + nested `chain` from `node.branch`.
   *
   * Ancestor params via {@link getPathParams}; resource keys via {@link resourceKeys}.
   *
   * @param href - Relative href (`pathname + search + hash`).
   * @param pathname - Browser pathname.
   * @param search - Raw search including `?`, or `''`.
   * @param hash - Raw hash including `#`, or `''`.
   * @param node - Leaf node from {@link matchPath}.
   * @param params - Path params for the leaf (usually from {@link matchPath}).
   */
  buildMatchedRouteInfo(
    href: string,
    pathname: string,
    search: string,
    hash: string,
    node: RouteNode,
    params?: Record<string, string>,
  ): MatchedRouteInfo {
    const leaf = buildActiveChain(
      node,
      { href, pathname, search, hash, params, query: parseSearch(search) },
      (targetPathname, targetPattern) => this.getPathParams(targetPathname, targetPattern),
    );

    for (const info of getActiveChain(leaf)) {
      const keys = resourceKeys(info);
      info.dataKey = keys.dataKey;
      info.viewKey = keys.viewKey;
    }

    return leaf;
  }

  /**
   * Path params for `(pathname, pattern)`, or `null` if the pattern does not match.
   *
   * Check order: global `*` → scoped `/*` → static `===` → `:param` (URLPattern).
   *
   * @param pathname - Browser pathname.
   * @param pattern - Route pattern (`node.pattern`).
   */
  getPathParams(pathname: string, pattern: string): Record<string, string> | null {
    if (isGlobalCatchAllPattern(pattern)) {
      return { splat: pathname.startsWith('/') ? pathname.slice(1) : pathname };
    }

    if (isScopedCatchAllPattern(pattern)) {
      return getScopedCatchAllParams(pathname, pattern);
    }

    if (isStaticRoutePattern(pattern)) {
      return pathname === pattern ? {} : null;
    }

    return this.getUrlPatternParams(pathname, pattern);
  }

  /**
   * Clears memoized `matchPath` and compiled `URLPattern` caches.
   * Call when the route tree is replaced or destroyed.
   */
  destroy(): void {
    memoize.clear(this, 'matchPath');
    this.urlPatterns.clear();
  }

  /**
   * Static O(1) map + dynamic `rest` list for `nodes`.
   * Cached by array identity (`WeakMap`); a new `nodes` reference rebuilds the index.
   */
  private getMatchIndex(nodes: readonly RouteNode[]): MatchIndex {
    const cached = this.matchIndexByNodes.get(nodes);
    if (cached) return cached;

    const exact = new Map<string, RouteNode>();
    const rest: RouteNode[] = [];
    for (const node of nodes) {
      if (isStaticRoutePattern(node.pattern)) exact.set(node.pattern, node);
      else rest.push(node);
    }

    const index = { exact, rest };
    this.matchIndexByNodes.set(nodes, index);
    return index;
  }

  /**
   * Params via compiled {@link URLPattern} for `:param` patterns.
   * On compile/exec failure, falls back to static `pathname === pattern`.
   */
  private getUrlPatternParams(pathname: string, pattern: string): Record<string, string> | null {
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

  /** Compiled `URLPattern` for `pattern` (cached in `urlPatterns`). */
  private getUrlPattern(pattern: string): URLPattern {
    let compiled = this.urlPatterns.get(pattern);
    if (!compiled) {
      compiled = new URLPattern({ pathname: pattern });
      this.urlPatterns.set(pattern, compiled);
    }
    return compiled;
  }
}

/**
 * Scoped catch-all `/users/*`: `/users/unknown` → `{ splat: 'unknown' }`.
 * Empty splat (`/users/` with no tail) → `null`.
 */
function getScopedCatchAllParams(pathname: string, pattern: string): Record<string, string> | null {
  const prefix = pattern.slice(0, -1); // `/users/*` → `/users/`
  if (!pathname.startsWith(prefix)) return null;
  const splat = pathname.slice(prefix.length);
  return splat ? { splat } : null;
}

export {
  computeMatchScore,
  isCatchAllRoutePattern,
  isParamRoutePattern,
  isStaticRoutePattern,
} from './route-score';
