/**
 * Fast-path eligibility for
 * {@link ../navigation/navigation-transaction-pipeline!NavigationTransactionPipeline.runFastPipeline}.
 *
 * Structural plan lives in {@link ./transition-plan}; this module only answers whether a
 * navigation may skip leave/guard/loads/transitions and take the short pipeline.
 *
 * @module route-tree/can-use-fast-path
 */
import { defaultDomCache, domCacheKey } from '../../../aura-route/core/view/dom-cache';
import type { RouteInstance } from '../route/types';
import type { ViewGraph } from '../view-graph';

import type { TransitionMap } from './transition-plan';

/**
 * Shared leave/guard/ready/transition gates for sync, dom-cache, and view-cache fast paths.
 *
 * Used by {@link ./transition-plan!finalizeTransitionPlan} when setting
 * {@link ./transition-plan!TransitionMap.canUseFastPath}, and by the cache predicates below.
 *
 * @returns `false` if exit has leave/ready, enter has guard/ready/transition-in, or either side
 *   sets `transition.order`
 */
export function hasFastPathLifecycleGates(
  enter: RouteInstance,
  exit: RouteInstance | undefined,
): boolean {
  if (exit?.hasLeave || enter.hasGuard || enter.hasTransitionIn) return false;
  if (exit?.hasReady || enter.hasReady) return false;
  if (enter.transition.order != null || exit?.transition.order != null) return false;
  return true;
}

/**
 * Dom-cache fast path: same lifecycle gates as {@link ./transition-plan!TransitionMap.canUseFastPath},
 * but enter content may be async when `cache.dom` keep-alive already holds the detached view.
 *
 * Same body as
 * {@link ../navigation/navigation-transaction-pipeline!NavigationTransactionPipeline.runFastPipeline}
 * — only eligibility differs. No DataGraph / load hooks (those stay on the full path).
 *
 * @returns `true` when the plan is flat, not already sync-fast, `cache.dom` is enabled, there is
 *   no `hasLoad`, lifecycle gates pass, and {@link ../../../aura-route/core/view/dom-cache!RouteDomCache.has}
 *   reports a hit for the enter match
 */
export function canUseDomCacheFastPath(plan: TransitionMap): boolean {
  if (plan.canUseFastPath || !plan.isFlatSingleEnter) return false;

  const enter = plan.enterRoute;
  const exit = plan.exitRoute;
  const enterMatch = plan.enterMatch;
  if (!enter || !enterMatch) return false;
  if (!enter.cache?.dom || enter.hasLoad) return false;
  if (!hasFastPathLifecycleGates(enter, exit)) return false;

  return defaultDomCache.has(domCacheKey(enterMatch, enter.path));
}

/**
 * View-cache fast path: same lifecycle gates as {@link ./transition-plan!TransitionMap.canUseFastPath},
 * when long `cache.view` already holds the enter payload.
 *
 * Same body as
 * {@link ../navigation/navigation-transaction-pipeline!NavigationTransactionPipeline.runFastPipeline}
 * — `route.resolveAndMountView` / ViewGraph take the warm hit.
 *
 * Rejects `hasLoad`, {@link ../route/types!RouteInstance.hasLayout}, and
 * {@link ../route/types!RouteInstance.viewLoaderNeedsData} (layout never writes long cache;
 * needsData keys may include data and are unsafe to probe with the base view key).
 *
 * @param plan — finalized transition map
 * @param viewGraph — store probe only ({@link ../view-graph/view-graph!ViewGraph.hasCachedView})
 * @returns `true` when the plan is flat, not already sync-fast, `cache.view` is enabled, layout /
 *   load / needsData gates pass, lifecycle gates pass, and the view store has a hit
 */
export function canUseViewCacheFastPath(
  plan: TransitionMap,
  viewGraph: Pick<ViewGraph, 'hasCachedView'>,
): boolean {
  if (plan.canUseFastPath || !plan.isFlatSingleEnter) return false;

  const enter = plan.enterRoute;
  const exit = plan.exitRoute;
  const enterMatch = plan.enterMatch;
  if (!enter || !enterMatch) return false;
  if (!enter.cache?.view || enter.hasLoad || enter.hasLayout || enter.viewLoaderNeedsData) {
    return false;
  }
  if (!hasFastPathLifecycleGates(enter, exit)) return false;

  return viewGraph.hasCachedView(enterMatch);
}
