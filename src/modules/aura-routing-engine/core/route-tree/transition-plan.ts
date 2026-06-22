import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  buildEnterRoutes,
  buildExitRoutes,
  findBranchLcaIndex,
} from './branch-diff';
import { getActiveChain, getLeafMatch, isSameRouteMatch } from './matched-chain';

/**
 * Строит TransitionMap для processor: exitRoutes, enterRoutes, lca, reenter.
 * @example null → profile: enter [settings, profile], exit []
 * @example profile → security: exit [profile], enter [security], lca settings
 * @example profile → profile (same url): reenter true
 */
export function buildTransitionPlan(from: MatchedRouteInfo | null, to: MatchedRouteInfo) {
  if (!from) {
    return {
      exitRoutes: [],
      enterRoutes: getActiveChain(to),
      lca: null,
      reenter: false,
    };
  }

  if (isSameNavigationTarget(from, to)) {
    const leaf = getLeafMatch(to);
    return {
      exitRoutes: [],
      enterRoutes: [leaf],
      lca: leaf,
      reenter: true,
    };
  }

  const fromChain = getActiveChain(from);
  const toChain = getActiveChain(to);
  const lcaIndex = findBranchLcaIndex(fromChain, toChain);

  return {
    exitRoutes: buildExitRoutes(fromChain, lcaIndex),
    enterRoutes: buildEnterRoutes(toChain, lcaIndex),
    lca: lcaIndex >= 0 ? fromChain[lcaIndex]! : null, // NOTE: in future for incremental render vs data cache
    reenter: false,
  };
}

/**
 * Тот же URL (pathname + search) и тот же leaf route — shortcut reenter.
 * @example `/settings/profile` → `/settings/profile` → true
 */
function isSameNavigationTarget(from: MatchedRouteInfo, to: MatchedRouteInfo): boolean {
  if (from.pathname !== to.pathname || from.search !== to.search) return false;
  return isSameRouteMatch(getLeafMatch(from), getLeafMatch(to));
}
