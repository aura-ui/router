import { resolveDocumentHrefParts, stripTrailingSlash, type ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import { applyCanonicalIndexFolderHref } from './canonical-index-href';
import { resolveRedirectHref } from './resolve-redirect-target';
import { getActiveChain } from '../route-tree/matched-chain';
import type { RouteNode } from '../route-tree/route-node.types';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from './url-matcher';

export const MAX_REDIRECT_HOPS = 5;

/** Successful match after following declarative redirect hops. */
export type MatchedNavigationTarget = {
  readonly kind: 'matched';
  readonly href: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly leaf: MatchedRouteInfo;
  readonly chain: readonly MatchedRouteInfo[];
  /** True when any hop in the chain was a declarative redirect (history should replace). */
  readonly viaRedirect: boolean;
};

export type NavigationTargetResolve =
  | MatchedNavigationTarget
  | { readonly kind: 'unmatched' }
  | {
      readonly kind: 'redirect-error';
      readonly code: 'redirect-cycle' | 'redirect-depth-exceeded';
      readonly href: string;
    };

type SingleMatch =
  | MatchedNavigationTarget
  | { readonly kind: 'redirect'; readonly href: string };

/** Normalized pathname key for redirect cycle detection (`/a` and `/a/` → same key). */
function visitKey(href: string): string {
  return stripTrailingSlash(resolveDocumentHrefParts(href).pathname);
}

/**
 * Match href against route nodes, follow declarative `redirect` hops, return final leaf target.
 *
 * Redirect targets are path-only; `search` / `hash` from the original request are kept on the
 * final matched leaf (alias URL → canonical page with the same query / fragment).
 */
export function resolveNavigationTarget(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
): NavigationTargetResolve {
  const initial = typeof href === 'string' ? resolveDocumentHrefParts(href) : href;
  let currentHref = initial.href;
  let viaRedirect = false;
  const visited = new Set<string>([visitKey(currentHref)]);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const step = matchSingleNavigationTarget(
      matcher,
      currentHref,
      nodes,
      initial.search,
      initial.hash,
    );
    if (!step) return { kind: 'unmatched' };

    if (step.kind === 'redirect') {
      if (hop >= MAX_REDIRECT_HOPS) {
        return { kind: 'redirect-error', code: 'redirect-depth-exceeded', href: currentHref };
      }
      const nextKey = visitKey(step.href);
      if (visited.has(nextKey)) {
        return { kind: 'redirect-error', code: 'redirect-cycle', href: step.href };
      }

      visited.add(nextKey);
      currentHref = step.href;
      viaRedirect = true;
      continue;
    }

    return viaRedirect ? { ...step, viaRedirect: true } : step;
  }

  return { kind: 'redirect-error', code: 'redirect-depth-exceeded', href: currentHref };
}

function matchSingleNavigationTarget(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  href: string,
  nodes: readonly RouteNode[],
  preservedSearch: string,
  preservedHash: string,
): SingleMatch | null {
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
    kind: 'matched',
    href: canonical.href,
    pathname: canonical.pathname,
    search: preservedSearch,
    hash: preservedHash,
    leaf,
    chain: getActiveChain(leaf),
    viaRedirect: false,
  };
}