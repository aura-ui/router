/**
 * Fast-path eligibility for {@link ../navigation/navigation-transaction-pipeline!NavigationTransactionPipeline.runFastPipeline}.
 *
 * Structural plan lives in {@link ./transition-plan}; this module only answers
 * “may this navigation skip guards/loads?”.
 *
 * @module route-tree/can-use-fast-path
 */
import { defaultDomCache, domCacheKey } from '../../../aura-route/core/view/dom-cache';
import type { RouteInstance } from '../route/types';
import type { ViewGraph } from '../view-graph';
import type { TransitionMap } from './transition-plan';

/**
 * Shared leave/guard/ready/transition gates for sync / dom-cache / view-cache fast paths.
 * Used by {@link ./transition-plan!finalizeTransitionPlan} (`canUseFastPath`) and cache predicates below.
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
 * Dom-cache fast path: same lifecycle gates as Tier 0 (`canUseFastPath`), but enter content
 * may be async when `cache.dom` keep-alive already holds the detached view.
 *
 * Same {@link ../navigation/navigation-transaction-pipeline!NavigationTransactionPipeline.runFastPipeline}
 * body — only eligibility differs. No DataGraph / load hooks (those stay on full path).
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
 * View-cache fast path: same lifecycle gates as Tier 0, when long `cache.view` already
 * holds the enter payload. Same `runFastPipeline` body — `route.render` / ViewGraph take the warm hit.
 * No DataGraph (`hasLoad` → full path).
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
  // Layout never writes long `cache.view` (`cache: false` in ViewGraph descriptor).
  if (!enter.cache?.view || enter.hasLoad || enter.hasLayout) return false;
  if (!hasFastPathLifecycleGates(enter, exit)) return false;

  return viewGraph.hasCachedView(enterMatch);
}
