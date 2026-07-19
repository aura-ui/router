/**
 * Sync mount for a resolved enter branch — root→leaf in one task, no `await` between nodes.
 *
 * @module view-mount/branch-mount
 */
import type { ApplyPreResolvedOptions } from '../../../aura-route/core/types';
import type { DataSnapshot } from '../data-graph';
import { resolveRouteData } from '../data-graph/route-data';
import type { ViewPayload } from '../view-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { isRenderError } from './view-commit-render';

export type BranchMountContext = {
  signal: AbortSignal;
  /**
   * Navigation cancellation check — prefer `() => !transaction.isActive()`
   * (abort + supersede), not `signal.aborted` alone.
   */
  aborted: () => boolean;
  paramChangeRemount?: boolean;
  /** Load-hook snapshot for a route (from DataGraph). */
  dataFor?: (route: MatchedRouteInfo) => unknown | undefined;
};

/** Minimal transaction surface for {@link createBranchMountContext}. */
export type BranchMountTransaction = {
  signal: AbortSignal;
  isActive(): boolean;
  dataSnapshot?: DataSnapshot;
  paramChangeRemount?: boolean;
};

/** Build mount context: `isActive()` covers abort and supersede. */
export function createBranchMountContext(
  transaction: BranchMountTransaction,
): BranchMountContext {
  const { dataSnapshot } = transaction;

  return {
    signal: transaction.signal,
    aborted: () => !transaction.isActive(),
    paramChangeRemount: transaction.paramChangeRemount === true,
    dataFor: dataSnapshot
      ? (route) => resolveRouteData(dataSnapshot, route)
      : undefined,
  };
}

export type MountEnterBranchResult =
  | { status: 'ok' }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown; route: MatchedRouteInfo };

/**
 * Mount all enter routes synchronously using {@link NavigationTransaction.viewSnapshot} payloads.
 */
export function mountEnterBranch(
  enterRoutes: readonly MatchedRouteInfo[],
  viewSnapshot: readonly (ViewPayload | null)[],
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
    const data = ctx.dataFor?.(matchedRoute);
    const options: ApplyPreResolvedOptions = {
      parentSignal: ctx.signal,
      preResolvedContent: viewSnapshot[i]!,
      ...(data !== undefined && { data }),
      ...(ctx.paramChangeRemount ? { paramChangeRemount: true } : {}),
    };

    const result = matchedRoute.route.applyPreResolved(matchedRoute, options);

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
