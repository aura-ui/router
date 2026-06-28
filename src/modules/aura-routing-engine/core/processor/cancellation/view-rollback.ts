import type { RouteInstance } from '../../route/types';
import type { TransitionMap } from '../../route-tree/transition-plan';
import type { CommitTracker } from '../../view-mount/view-mount-tracker';

/** Unique routes touched by enter/exit branches of one transaction. */
export function collectTransactionRoutes(plan: TransitionMap): RouteInstance[] {
  const seen = new Set<RouteInstance>();
  const routes: RouteInstance[] = [];

  for (const matched of [...plan.enterRoutes, ...plan.exitRoutes]) {
    if (seen.has(matched.route)) continue;
    seen.add(matched.route);
    routes.push(matched.route);
  }

  return routes;
}

/** Restores outlet/view state after a cancelled navigation (supersede, guard, render abort). */
export function rollbackCancelledNavigation(
  plan: TransitionMap,
  commitTracker: CommitTracker,
): void {
  if (commitTracker.isViewCommitted()) return;

  // revertInFlightView: full DOM restore only for stage; replace routes — see outlet rollbackStaged TODO.
  for (const route of collectTransactionRoutes(plan)) {
    route.revertInFlightView?.();
  }
}
