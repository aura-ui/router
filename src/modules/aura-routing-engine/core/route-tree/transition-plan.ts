import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteInstance } from '../route/types';
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
  update: boolean;
}

/** Target `<aura-route>` of the enter branch (content leaf). */
export function getEnterRoute(plan: TransitionMap): MatchedRouteInfo['route'] | undefined {
  return plan.enterRoutes.at(-1)?.route;
}

/**
 * Строит TransitionMap для processor: exitRoutes, enterRoutes, lca, update.
 * @example null → profile: enter [settings, profile], exit []
 * @example profile → security: exit [profile], enter [security], lca settings
 * @example profile → profile?tab=2 (same pathname + leaf): update true
 * @example /users/1 → /users/2 (same leaf, same view key): update true
 * @example /users/1 → /users/2 (same leaf, per-id view ref): update false, synthetic remount
 */
export function buildTransitionPlan(from: MatchedRouteInfo | null, to: MatchedRouteInfo): TransitionMap {
  if (!from) {
    return {
      exitRoutes: [],
      enterRoutes: getActiveChain(to),
      lca: null,
      update: false,
    };
  }

  const fromLeaf = getLeafMatch(from);
  const toLeaf = getLeafMatch(to);

  if (isSameRouteMatch(fromLeaf, toLeaf)) {
    return buildSameRecordPlan(fromLeaf, toLeaf);
  }

  const fromChain = getActiveChain(from);
  const toChain = getActiveChain(to);
  const lcaIndex = findBranchLcaIndex(fromChain, toChain);

  return {
    exitRoutes: buildExitRoutes(fromChain, lcaIndex),
    enterRoutes: buildEnterRoutes(toChain, lcaIndex),
    lca: lcaIndex >= 0 ? fromChain[lcaIndex]! : null, // NOTE: in future for incremental render vs data cache
    update: false,
  };
}

function resolveParamChangeMode(fromLeaf: MatchedRouteInfo, toLeaf: MatchedRouteInfo): 'update' | 'navigate' {
  const mode = toLeaf.route.paramChange as RouteInstance['paramChange'];
  if (mode === 'navigate') return 'navigate';
  if (mode === 'update') {
    warnParamChangeUpdateMismatch(fromLeaf, toLeaf);
    return 'update';
  }
  const fromKey = fromLeaf.resolvedView?.viewKey ?? null;
  const toKey = toLeaf.resolvedView?.viewKey ?? null;
  if (fromKey === null || toKey === null) return 'update';
  return fromKey === toKey ? 'update' : 'navigate';
}

function warnParamChangeUpdateMismatch(fromLeaf: MatchedRouteInfo, toLeaf: MatchedRouteInfo): void {
  const fromKey = fromLeaf.resolvedView?.viewKey;
  const toKey = toLeaf.resolvedView?.viewKey;
  if (!fromKey || !toKey || fromKey === toKey) return;

  console.warn(
    `[aura-router] param-change="update" with different viewKey (${fromKey} → ${toKey}): `
    + 'UPDATE shortcut skips render — stale HTML risk. Omit param-change or use param-change="navigate".',
  );
}

function buildSameRecordPlan(fromLeaf: MatchedRouteInfo, toLeaf: MatchedRouteInfo): TransitionMap {
  if (resolveParamChangeMode(fromLeaf, toLeaf) === 'update') {
    return {
      exitRoutes: [],
      enterRoutes: [toLeaf],
      lca: toLeaf,
      update: true,
    };
  }

  const chain = getActiveChain(fromLeaf);
  const parentIndex = chain.length - 2;
  return {
    exitRoutes: [fromLeaf],
    enterRoutes: [toLeaf],
    lca: parentIndex >= 0 ? chain[parentIndex]! : null,
    update: false,
  };
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
