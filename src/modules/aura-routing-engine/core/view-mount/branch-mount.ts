/**
 * Sync mount for a resolved enter branch — root→leaf in one task, no `await` between nodes.
 *
 * @module view-mount/branch-mount
 */
import { resolveRouteData } from '../data-graph/route-data';
import { isRenderError } from './view-commit-render';
import type { MountResolvedViewOptions } from '../../../aura-route/core/types';
import type { DataSnapshot } from '../data-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { ViewSnapshotEntry } from '../view-graph';

export type BranchMountContext = {
  signal: AbortSignal;
  /** Prefer `() => !transaction.isActive()` (abort + supersede). */
  aborted: () => boolean;
  paramChangeRemount?: boolean;
  dataSnapshot?: DataSnapshot;
};

export type MountEnterBranchResult =
  | { status: 'ok' }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown; route: MatchedRouteInfo };

/**
 * Mount enter routes synchronously from {@link NavigationTransaction.viewSnapshot}.
 */
export function mountEnterBranch(
  enterRoutes: readonly MatchedRouteInfo[],
  viewSnapshot: readonly ViewSnapshotEntry[],
  ctx: BranchMountContext,
): MountEnterBranchResult {
  if (ctx.aborted()) return { status: 'aborted' };

  if (viewSnapshot.length !== enterRoutes.length) {
    return {
      status: 'error',
      error: new Error(
        `Branch mount: expected ${enterRoutes.length} view payloads, got ${viewSnapshot.length}`,
      ),
      route: enterRoutes[0]!,
    };
  }

  for (let i = 0; i < enterRoutes.length; i++) {
    const matchedRoute = enterRoutes[i]!;
    const data = ctx.dataSnapshot
      ? resolveRouteData(ctx.dataSnapshot, matchedRoute)
      : undefined;
    const options: MountResolvedViewOptions = {
      parentSignal: ctx.signal,
      preResolvedView: viewSnapshot[i]!.payload,
      ...(data !== undefined && { data }),
      ...(ctx.paramChangeRemount ? { paramChangeRemount: true } : {}),
    };

    const result = matchedRoute.route.mountResolvedView(matchedRoute, options);

    if (result === 'aborted' || ctx.aborted()) {
      rollbackMounted(enterRoutes, i);
      return { status: 'aborted' };
    }
    if (isRenderError(result)) {
      rollbackMounted(enterRoutes, i);
      return { status: 'error', error: result.error, route: matchedRoute };
    }
  }

  return { status: 'ok' };
}

function rollbackMounted(enterRoutes: readonly MatchedRouteInfo[], failedIndex: number): void {
  for (let i = failedIndex - 1; i >= 0; i--) {
    enterRoutes[i]!.route.revertInFlightView?.();
  }
}
