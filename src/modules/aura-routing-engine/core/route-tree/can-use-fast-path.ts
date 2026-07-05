import type { MatchedRouteInfo } from '../match/url-matcher';
import type { TransitionMap } from './transition-plan';

/** Tier 0: trivial flat navigation without blocking hooks, async content, or transitions. */
export function canUseFastPath(
  plan: TransitionMap,
  _from: MatchedRouteInfo | null,
  _to: MatchedRouteInfo,
): boolean {
  if (plan.update) return false;
  if (plan.paramChangeRemount) return false;
  if (plan.exitRoutes.length > 1 || plan.enterRoutes.length !== 1) return false;

  const exitRoute = plan.exitRoutes[0]?.route;
  const enterRoute = plan.enterRoutes[0]!.route;

  if (exitRoute?.hasLeave) return false;
  if (enterRoute.hasGuard) return false;
  if (enterRoute.hasLoad) return false;
  if (enterRoute.hasTransitionIn) return false;
  if (exitRoute?.hasReady) return false;
  if (enterRoute.hasReady) return false;
  if (enterRoute.hasAsyncContent) return false;
  if (enterRoute.transition.order != null) return false;
  if (exitRoute?.transition.order != null) return false;

  return true;
}
