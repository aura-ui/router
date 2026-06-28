import { parsePath } from '../../../aura-utils/misc/url';
import { getActiveChain } from '../route-tree/matched-chain';
import type { RouteNode } from '../route-tree/route-node.types';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from './url-matcher';

/** Matched leaf + active branch for navigation and prefetch. */
export type NavigationTarget = {
  href: string;
  pathname: string;
  search: string;
  hash: string;
  leaf: MatchedRouteInfo;
  chain: readonly MatchedRouteInfo[];
};

/** Match href against route nodes → leaf `MatchedRouteInfo` + `getActiveChain`. */
export function resolveNavigationTarget(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  href: string,
  nodes: readonly RouteNode[],
): NavigationTarget | null {
  const { pathname, search, hash } = parsePath(href);
  const found = matcher.matchPath(pathname, nodes);
  if (!found) return null;

  const leaf = matcher.toRouteInfo(href, pathname, search, hash, found.node, found.params);

  return {
    href,
    pathname,
    search,
    hash,
    leaf,
    chain: getActiveChain(leaf),
  };
}
