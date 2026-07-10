import { resolveDocumentHrefParts, stripTrailingSlash, type ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import { applyCanonicalIndexFolderHref } from './canonical-index-href';
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
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
): NavigationTarget | null {
  const resolved = typeof href === 'string' ? resolveDocumentHrefParts(href) : href;
  const { pathname, search, hash } = resolved;
  const found = matcher.matchPath(stripTrailingSlash(pathname), nodes);
  if (!found) return null;

  const canonical = applyCanonicalIndexFolderHref(pathname, search, hash, found.node);
  const leaf = matcher.toRouteInfo(
    canonical.href,
    canonical.pathname,
    search,
    hash,
    found.node,
    found.params,
  );

  return {
    href: canonical.href,
    pathname: canonical.pathname,
    search,
    hash,
    leaf,
    chain: getActiveChain(leaf),
  };
}
