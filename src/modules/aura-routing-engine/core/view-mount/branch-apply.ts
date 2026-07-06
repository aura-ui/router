/**
 * Sync apply for a resolved enter branch — root→leaf in one task, no `await` between nodes.
 *
 * @module view-mount/branch-apply
 */
import type { RouteRenderOptions, ApplyPreResolvedOptions } from '../../../aura-route/core/types';
import type { ViewPayload } from '../content/model/types';
import type { DataSnapshot } from '../data-graph';
import { resolveRouteData } from '../data-graph/route-data';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteInstance } from '../route/types';
import type { BranchResolveTransaction } from './branch-resolver';
import { isRenderError } from './view-commit-render';

export type BranchApplyContext = {
  signal: AbortSignal;
  aborted: () => boolean;
  dataFor?: (route: MatchedRouteInfo) => unknown | undefined;
  paramChangeRemount?: boolean;
};

export type BranchApplyTransaction = BranchResolveTransaction & {
  dataSnapshot?: DataSnapshot;
  transitionPlan: { paramChangeRemount?: boolean };
};

export type BranchApplyResult =
  | { status: 'ok' }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown; route: MatchedRouteInfo };

export function createBranchApplyContext(transaction: BranchApplyTransaction): BranchApplyContext {
  const { dataSnapshot } = transaction;

  return {
    signal: transaction.signal,
    aborted: () => !transaction.isActive(),
    dataFor: dataSnapshot
      ? (route) => resolveRouteData(dataSnapshot, route)
      : undefined,
    paramChangeRemount: transaction.transitionPlan.paramChangeRemount,
  };
}

/**
 * Mount all enter routes synchronously using pre-resolved payloads.
 * Caller must finish {@link resolveEnterBranch} first.
 */
export function applyEnterBranch(
  enterRoutes: readonly MatchedRouteInfo[],
  payloads: readonly (ViewPayload | null)[],
  ctx: BranchApplyContext,
): BranchApplyResult {
  if (ctx.aborted()) return { status: 'aborted' };

  if (payloads.length !== enterRoutes.length) {
    return {
      status: 'error',
      error: new Error(
        `Branch apply: expected ${enterRoutes.length} payloads, got ${payloads.length}`,
      ),
      route: enterRoutes[0]!,
    };
  }

  for (let i = 0; i < enterRoutes.length; i++) {
    const matchedRoute = enterRoutes[i]!;
    const route: RouteInstance = matchedRoute.route;

    const result = route.applyPreResolved(
      matchedRoute,
      buildApplyOptions(matchedRoute, payloads[i] ?? null, ctx),
    );

    if (result === 'aborted' || ctx.aborted()) {
      rollbackApplied(enterRoutes, i);
      return { status: 'aborted' };
    }
    if (isRenderError(result)) {
      rollbackApplied(enterRoutes, i);
      return { status: 'error', error: result.error, route: matchedRoute };
    }
  }

  return { status: 'ok' };
}

function buildApplyOptions(
  matchedRoute: MatchedRouteInfo,
  payload: ViewPayload | null,
  ctx: BranchApplyContext,
): ApplyPreResolvedOptions {
  const options: ApplyPreResolvedOptions = {
    parentSignal: ctx.signal,
    preResolvedContent: payload,
  };

  if (ctx.paramChangeRemount) options.paramChangeRemount = true;

  const data = ctx.dataFor?.(matchedRoute);
  if (data !== undefined) options.data = data;

  return options;
}

function rollbackApplied(enterRoutes: readonly MatchedRouteInfo[], failedIndex: number): void {
  for (let i = failedIndex - 1; i >= 0; i--) {
    enterRoutes[i]!.route.revertInFlightView?.();
  }
}
