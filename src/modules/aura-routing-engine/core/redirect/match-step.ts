import { joinAppHref } from '../../../aura-utils/misc/url';
import { resolveDocumentHrefParts } from '../link-active/app-href';
import type { AuraRoutingUrlMatcher } from '../match/url-matcher';
import { resolvePattern } from '../route-tree/resolve-pattern';
import type { RouteNode } from '../route-tree/route-node.types';

import type { NavigationMatchStep } from './types';

/**
 * Resolves a declarative `redirect` attr to an app-relative href.
 * Relative targets are resolved against the parent route pattern.
 */
export function resolveRedirectHref(node: RouteNode, rawTarget: string): string {
  const pathname = resolvePattern(node.parent?.pattern ?? null, rawTarget.trim());
  return resolveDocumentHrefParts(pathname).href;
}

/**
 * Looks up one navigation step for `href` in the route tree.
 *
 * @param matcher - URL matcher (`matchPath` + `buildMatchedRouteInfo`).
 * @param href - Current chain href (pathname may change per hop).
 * @param nodes - Matchable route nodes for this registry generation.
 * @param preservedSearch - `search` from the original navigation request.
 * @param preservedHash - `hash` from the original navigation request.
 * @returns Leaf match, declarative redirect hop, or `null` when unmatched.
 */
export function lookupNavigationStep(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'buildMatchedRouteInfo'>,
  href: string,
  nodes: readonly RouteNode[],
  preservedSearch: string,
  preservedHash: string,
): NavigationMatchStep | null {
  const { pathname } = resolveDocumentHrefParts(href);
  const found = matcher.matchPath(pathname, nodes);
  if (!found) return null;

  if (found.node.route.type === 'redirect') {
    return {
      kind: 'redirect',
      href: resolveRedirectHref(found.node, found.node.route.redirect),
    };
  }

  const leafHref = joinAppHref({ pathname, search: preservedSearch, hash: preservedHash });
  const leaf = matcher.buildMatchedRouteInfo(
    leafHref,
    pathname,
    preservedSearch,
    preservedHash,
    found.node,
    found.params,
  );

  return {
    ...leaf,
    kind: 'matched',
    viaRedirect: false,
  };
}
