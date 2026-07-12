import type { ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { AuraRoutingUrlMatcher } from '../match/url-matcher';
import type { RouteNode } from '../route-tree/route-node.types';
import { followDeclarativeRedirectHops } from './hop-iterator';
import type { DeclarativeTargetResolve, MatchedNavigationTarget } from './types';

/**
 * Sync target resolution — declarative `redirect` attr hops only (no hooks).
 *
 * Used by prefetch and any caller that needs a final leaf without running the navigation pipeline.
 * Redirect targets are path-only; `search` / `hash` from the original request are kept on the leaf.
 */
export function resolveDeclarativeTarget(
  matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>,
  href: string | ResolvedDocumentHref,
  nodes: readonly RouteNode[],
): DeclarativeTargetResolve {
  return followDeclarativeRedirectHops(
    matcher,
    href,
    nodes,
    (target: MatchedNavigationTarget) => target,
  );
}
