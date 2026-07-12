import { resolveDocumentHrefParts, stripTrailingSlash } from '../../../aura-utils/misc/url';
import { applyCanonicalIndexFolderHref } from '../match/canonical-index-href';
import { resolvePattern } from '../route-tree/resolve-pattern';
import type { RouteNode } from '../route-tree/route-node.types';
import type { AuraRoutingUrlMatcher } from '../match/url-matcher';
import type { NavigationMatchStep } from './types';

/** Resolves declarative `redirect` attr to an app-relative href (absolute or relative to parent). */
export function resolveRedirectHref(node: RouteNode, rawTarget: string): string {
  const pathname = resolvePattern(node.parent?.pattern ?? null, rawTarget.trim());
  return resolveDocumentHrefParts(pathname).href;
}

/** One redirection step: leaf page/folder index, declarative redirect, or no match. */
export function matchNavigationStep(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  href: string,
  nodes: readonly RouteNode[],
  preservedSearch: string,
  preservedHash: string,
): NavigationMatchStep | null {
  const { pathname } = resolveDocumentHrefParts(href);
  const found = matcher.matchPath(stripTrailingSlash(pathname), nodes);
  if (!found) return null;

  if (found.node.route.type === 'redirect') {
    return {
      kind: 'redirect',
      href: resolveRedirectHref(found.node, found.node.route.redirect),
    };
  }

  const canonical = applyCanonicalIndexFolderHref(
    pathname,
    preservedSearch,
    preservedHash,
    found.node,
  );

  const leaf = matcher.toRouteInfo(
    canonical.href,
    canonical.pathname,
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
