import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  buildEnterRoutes,
  buildExitRoutes,
  findBranchLcaIndex,
} from './branch-diff';
import { getActiveChain, getLeafMatch, isSameRouteMatch } from './matched-chain';

/** Branch diff (exit/enter routes) — not {@link ../../../aura-route/core/attr/transition-order-attr-parser!TransitionOrderType | view effect order}. */
export interface TransitionMap {
  exitRoutes: MatchedRouteInfo[];
  enterRoutes: MatchedRouteInfo[];
  lca: MatchedRouteInfo | null;
  reenter: boolean;
}

/** Target `<aura-route>` of the enter branch (content leaf). */
export function getEnterRoute(plan: TransitionMap): MatchedRouteInfo['route'] | undefined {
  return plan.enterRoutes.at(-1)?.route;
}

/**
 * Строит TransitionMap для processor: exitRoutes, enterRoutes, lca, reenter.
 * @example null → profile: enter [settings, profile], exit []
 * @example profile → security: exit [profile], enter [security], lca settings
 * @example profile → profile?tab=2 (same pathname + leaf): reenter true
 */
export function buildTransitionPlan(from: MatchedRouteInfo | null, to: MatchedRouteInfo): TransitionMap {
  if (!from) {
    return {
      exitRoutes: [],
      enterRoutes: getActiveChain(to),
      lca: null,
      reenter: false,
    };
  }

  if (isSameRouteLeaf(from, to)) {
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
 * Same leaf on the same pathname — reenter shortcut (`search` / `hash` may differ).
 * @example `/users?q=1` → `/users?q=2` with the same leaf → true
 */
export function isSameRouteLeaf(from: MatchedRouteInfo, to: MatchedRouteInfo): boolean {
  if (from.pathname !== to.pathname) return false;
  return isSameRouteMatch(getLeafMatch(from), getLeafMatch(to));
}

/**
 * Exact same navigation slice for dedupe and history: pathname + search + leaf.
 * Hash is not compared — hash-only navigations bypass the transaction in the engine.
 * @example `/settings/profile` → `/settings/profile` → true
 * @example `/users?q=1` → `/users?q=2` → false
 */
export function isSameNavigationTarget(from: MatchedRouteInfo, to: MatchedRouteInfo): boolean {
  if (from.pathname !== to.pathname || from.search !== to.search) return false;
  return isSameRouteMatch(getLeafMatch(from), getLeafMatch(to));
}
