/**
 * Sync apply for a resolved enter branch — root→leaf in one task, no `await` between nodes.
 *
 * @module view-mount/branch-apply
 */
import type { ApplyPreResolvedOptions } from '../../../aura-route/core/types';
import type { ViewPayload } from '../content/model/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { BranchResolveContext } from './branch-resolver';
import { isRenderError } from './view-commit-render';

export type BranchApplyResult =
  | { status: 'ok' }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown; route: MatchedRouteInfo };

/**
 * Mount all enter routes synchronously using pre-resolved payloads.
 * Reuses {@link BranchResolveContext} from {@link resolveEnterBranch}.
 */
export function applyEnterBranch(
  enterRoutes: readonly MatchedRouteInfo[],
  payloads: readonly (ViewPayload | null)[],
  ctx: BranchResolveContext,
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
    const data = ctx.dataFor?.(matchedRoute);
    const options: ApplyPreResolvedOptions = {
      parentSignal: ctx.signal,
      preResolvedContent: payloads[i]!,
      ...(data !== undefined && { data }),
    };

    const result = matchedRoute.route.applyPreResolved(matchedRoute, options);

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

function rollbackApplied(enterRoutes: readonly MatchedRouteInfo[], failedIndex: number): void {
  for (let i = failedIndex - 1; i >= 0; i--) {
    enterRoutes[i]!.route.revertInFlightView?.();
  }
}
