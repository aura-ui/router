import { isSamePathAndSearch } from '../link-active/app-href';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteInstance } from '../route/types';
import {
  buildEnterRoutes,
  buildExitRoutes,
  findBranchLcaIndex,
} from './branch-diff';
import { getActiveChain, getLeafMatch, isSameRouteMatch } from './matched-chain';

/**
 * Structural branch diff before derived query fields are attached.
 * Prefer {@link buildTransitionPlan} / {@link finalizeTransitionPlan} over hand-built maps.
 */
export type TransitionPlanBase = {
  /** Узлы для deactivate, leaf → root (LCA не входит). */
  exitRoutes: MatchedRouteInfo[];
  /** Узлы для activate, root → leaf (LCA не входит). */
  enterRoutes: MatchedRouteInfo[];
  /** Lowest common ancestor; `null` при cold enter или полной смене ветки. */
  lca: MatchedRouteInfo | null;
  /** `true` — update shortcut (тот же leaf, без leave/guard/render). */
  update: boolean;
  /**
   * Synthetic param remount на том же leaf `<aura-route>`: render enter уже заменил DOM.
   * Controller в `onUnmount` не трогает active view; `unmount="…"` hooks на exitRoutes остаются.
   */
  paramChangeRemount?: boolean;
};

/**
 * План перехода между двумя match-состояниями: какие ветки деактивировать/активировать.
 * Branch diff (exit/enter routes) — не {@link TransitionOrderType | view effect order}.
 *
 * Derived fields are filled once by {@link finalizeTransitionPlan}.
 */
export interface TransitionMap extends TransitionPlanBase {
  /** Enter-branch leaf match (`enterRoutes` last); `undefined` when enter is empty. */
  readonly enterMatch: MatchedRouteInfo | undefined;
  /** Exit-branch leaf match (`exitRoutes[0]`); `undefined` when exit is empty. */
  readonly exitMatch: MatchedRouteInfo | undefined;
  /** `enterMatch?.route`. */
  readonly enterRoute: RouteInstance | undefined;
  /** `exitMatch?.route`. */
  readonly exitRoute: RouteInstance | undefined;
  /** Enter-leaf `transition-order` (null when absent). */
  readonly transitionOrder: TransitionOrderType | null;
  /** Any exit route declares `leave`. */
  readonly hasExitLeave: boolean;
  /** Any enter route declares `guard`. */
  readonly hasEnterGuard: boolean;
  /** `hasExitLeave || hasEnterGuard` — blocking leave→guard probe needed. */
  readonly needsBlockingWalk: boolean;
  /**
   * Structural Tier-0 shape: one enter leaf, at most one exit, not update/remount.
   */
  readonly isFlatSingleEnter: boolean;
  /**
   * Tier-0 eligibility: {@link isFlatSingleEnter} plus sync inline content and no blocking
   * leave/guard/ready/transition hooks on the enter/exit leaves.
   */
  readonly canUseFastPath: boolean;
}

/**
 * Строит {@link TransitionMap} для navigation processor.
 *
 * @param from — текущий committed match; `null` при cold enter
 * @param to — целевой match после matchPath
 * @returns exit/enter ветки, LCA и флаг update shortcut
 *
 * @example null → profile: enter [settings, profile], exit []
 * @example profile → security: exit [profile], enter [security], lca settings
 * @example profile → profile?tab=2 (same leaf): update true
 * @example /users/1 → /users/2 (same leaf, same view key): update true
 * @example /users/1 → /users/2 (same leaf, per-id view content): update false, synthetic remount
 */
export function buildTransitionPlan(from: MatchedRouteInfo | null, to: MatchedRouteInfo): TransitionMap {
  if (!from) {
    return finalizeTransitionPlan({
      exitRoutes: [],
      enterRoutes: getActiveChain(to),
      lca: null,
      update: false,
    });
  }

  const fromLeaf = getLeafMatch(from);
  const toLeaf = getLeafMatch(to);

  if (isSameRouteMatch(fromLeaf, toLeaf)) {
    return buildSameRecordPlan(fromLeaf, toLeaf);
  }

  const fromChain = getActiveChain(from);
  const toChain = getActiveChain(to);
  const lcaIndex = findBranchLcaIndex(fromChain, toChain);

  return finalizeTransitionPlan({
    exitRoutes: buildExitRoutes(fromChain, lcaIndex),
    enterRoutes: buildEnterRoutes(toChain, lcaIndex),
    lca: lcaIndex >= 0 ? fromChain[lcaIndex]! : null, // NOTE: in future for incremental render vs data cache
    update: false,
  });
}

/**
 * Режим param-change для того же leaf: update shortcut или synthetic remount.
 * Учитывает `param-change` attr и совпадение `viewKey` (auto по умолчанию).
 */
function resolveParamChangeMode(fromLeaf: MatchedRouteInfo, toLeaf: MatchedRouteInfo): 'update' | 'navigate' {
  const mode = toLeaf.route.paramChange as RouteInstance['paramChange'];
  if (mode === 'navigate') return 'navigate';

  const fromKey = fromLeaf.resolvedView?.viewKey ?? null;
  const toKey = toLeaf.resolvedView?.viewKey ?? null;

  if (mode === 'update') {
    if (fromKey && toKey && fromKey !== toKey) {
      console.warn(
        `[aura-router] param-change="update" with different viewKey (${fromKey} → ${toKey}): `
        + 'UPDATE shortcut skips render — stale HTML risk. Omit param-change or use param-change="navigate".',
      );
    }
    return 'update';
  }

  if (fromKey === null || toKey === null) return 'update';
  return fromKey === toKey ? 'update' : 'navigate';
}

/**
 * План для того же route record (тот же leaf `RouteNode`): update или synthetic exit/enter leaf.
 * Pathname/search/params могут отличаться.
 */
function buildSameRecordPlan(fromLeaf: MatchedRouteInfo, toLeaf: MatchedRouteInfo): TransitionMap {
  if (resolveParamChangeMode(fromLeaf, toLeaf) === 'update') {
    return finalizeTransitionPlan({
      exitRoutes: [],
      enterRoutes: [toLeaf],
      lca: toLeaf,
      update: true,
    });
  }

  const chain = getActiveChain(fromLeaf);
  const parentIndex = chain.length - 2;
  return finalizeTransitionPlan({
    exitRoutes: [fromLeaf],
    enterRoutes: [toLeaf],
    lca: parentIndex >= 0 ? chain[parentIndex]! : null,
    update: false,
    paramChangeRemount: true,
  });
}

/**
 * Точное совпадение navigation slice для dedupe и history: pathname + search + leaf.
 * Hash не сравнивается — hash-only навигации обходят transaction в engine.
 *
 * @example `/settings/profile` → `/settings/profile` → true
 * @example `/users?q=1` → `/users?q=2` → false
 */
export function isSameNavigationTarget(from: MatchedRouteInfo, to: MatchedRouteInfo): boolean {
  if (!isSamePathAndSearch(from, to)) return false;
  return isSameRouteMatch(getLeafMatch(from), getLeafMatch(to));
}

/**
 * Attaches derived query fields. Use for test fixtures that build a plan without
 * {@link buildTransitionPlan}.
 */
export function finalizeTransitionPlan(base: TransitionPlanBase): TransitionMap {
  const enterMatch = base.enterRoutes[base.enterRoutes.length - 1];
  const exitMatch = base.exitRoutes[0];
  const enterRoute = enterMatch?.route;
  const exitRoute = exitMatch?.route;

  const hasExitLeave = base.exitRoutes.some((matched) => matched.route.hasLeave);
  const hasEnterGuard = base.enterRoutes.some((matched) => matched.route.hasGuard);
  const isFlatSingleEnter =
    !base.update
    && !base.paramChangeRemount
    && base.enterRoutes.length === 1
    && base.exitRoutes.length <= 1;

  const transitionOrder = enterRoute?.transition.order ?? null;

  const canUseFastPath =
    isFlatSingleEnter
    && !!enterRoute
    && enterRoute.hasSyncContent
    && !exitRoute?.hasLeave
    && !enterRoute.hasGuard
    && !enterRoute.hasTransitionIn
    && !exitRoute?.hasReady
    && !enterRoute.hasReady
    && enterRoute.transition.order == null
    && exitRoute?.transition.order == null;

  return {
    ...base,
    enterMatch,
    exitMatch,
    enterRoute,
    exitRoute,
    transitionOrder,
    hasExitLeave,
    hasEnterGuard,
    needsBlockingWalk: hasExitLeave || hasEnterGuard,
    isFlatSingleEnter,
    canUseFastPath,
  };
}
