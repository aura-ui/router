import { parsePath } from '../../../aura-utils/misc/url';
import { getActiveChain } from '../route-tree';
import type { AuraRoutingUrlMatcher } from '../match/url-matcher';
import type { RouteNode } from '../route-tree';
import type { PrefetchTarget } from './types';
import { normalizePrefetchHref } from './policy';

export function resolvePrefetchTarget(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  nodes: readonly RouteNode[],
  href: string,
): PrefetchTarget | null {
  const normalized = normalizePrefetchHref(href);
  if (!normalized) return null;

  const { pathname, search, hash } = parsePath(normalized);
  const found = matcher.matchPath(pathname, nodes);
  if (!found) return null;

  const leaf = matcher.toRouteInfo(normalized, pathname, search, hash, found.node, found.params);

  return {
    href: normalized,
    pathname,
    search,
    hash,
    leaf,
    chain: getActiveChain(leaf),
  };
}
