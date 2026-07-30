import type { RouteInstance } from '../route/types';
import type { TransitionPlanBase } from '../route-tree/transition-plan';

import type { ViewCommitTracker } from './view-commit-tracker';

/** Unique routes touched by enter/exit branches of one transaction. */
export function collectTransactionRoutes(plan: TransitionPlanBase): RouteInstance[] {
  const seen = new Set<RouteInstance>();
  const routes: RouteInstance[] = [];

  for (const matched of [...plan.enterRoutes, ...plan.exitRoutes]) {
    if (seen.has(matched.route)) continue;
    seen.add(matched.route);
    routes.push(matched.route);
  }

  return routes;
}

/** Restores uncommitted outlet/view state after supersede, guard cancel, or render abort. */
export function rollbackUncommittedViews(
  plan: TransitionPlanBase,
  viewCommitTracker: ViewCommitTracker,
): void {
  if (viewCommitTracker.isViewCommitted()) return;

  // revertInFlightView: full DOM restore only for stage; replace routes — see outlet rollbackStaged TODO.
  for (const route of collectTransactionRoutes(plan)) {
    route.revertInFlightView?.();
  }
}
