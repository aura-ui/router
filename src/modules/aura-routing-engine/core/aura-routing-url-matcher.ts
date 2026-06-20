import type { AURARoute } from '../../aura-route/core/aura-route';
import { parsePath, parseQuery } from '../../aura-utils/misc/url';

export interface MatchedRouteInfo {
  /** Resolved URL pathname, e.g. `/user/42`. */
  url: string;
  pathname: string;
  search: string;
  hash: string;
  /** Registered route pattern, e.g. `/user/:id`. */
  routePath: string;
  route: AURARoute;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/** Declarative 404: <aura-route path="*"> */
export const CATCH_ALL_ROUTE_PATH = '*' as const;
export function isCatchAllRoute(routePath: string): boolean {
  return routePath === CATCH_ALL_ROUTE_PATH || routePath === '/*';
}
/** Catch-all всегда проигрывает конкретным routes */
function routeScore(routePath: string): number {
  return isCatchAllRoute(routePath)
    ? -1
    : routePath.split('/').filter(Boolean).length;
}

export class AuraRoutingUrlMatcher {


  //findBestMatchRoute
  match(pathname: string, routesPaths: Iterable<string>): {
    routePath: string;
    params: Record<string, string>
  } | null {
    let best: { routePath: string; params: Record<string, string>; score: number } | null = null;

    for (const routePath of routesPaths) {
      const params = this.getPathParams(pathname, routePath);
      if (params === null) continue;
      const score = routeScore(routePath);
      if (!best || score > best.score) {
        best = { routePath, params, score };
      }
    }

    return best ? { routePath: best.routePath, params: best.params } : null;
  }
/**
  * Match pathname against an Express-style pattern using URLPattern.
  * Returns captured groups or null when no match.
*/
  getPathParams(pathname: string, routePath: string): Record<string, string> | null {
  // --- catch-all: matчит любой pathname ---
  if (isCatchAllRoute(routePath)) {
    // /users/42 → { splat: 'users/42' }
    // /         → { splat: '' }
    const splat = pathname.replace(/^\//, '');
    return { splat };
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

  /** Собрать MatchedRouteInfo для processor. */
  toRouteInfo(
    url: string,
    pathname: string, search: string, hash: string,
    routePath: string,
    route: AURARoute,
    params?: Record<string, string>,
  ): MatchedRouteInfo {
    const query = parseQuery(search);
    return {
      url,
      pathname,
      search,
      hash,
      routePath,
      route,
      ...(params && Object.keys(params).length > 0 && { params }),
      ...(query && Object.keys(query).length > 0 && { query }),
    };
  }




  /** Только смена #якоря на том же path — без полного transition. */
  isHashOnly(href: string, currentHref: string): boolean {
    const next = parsePath(href);
    const current = parsePath(currentHref);
    const sameRoute = next.pathname === current.pathname && next.search === current.search;
    return Boolean(sameRoute && next.hash && next.hash !== current.hash);
  }
}