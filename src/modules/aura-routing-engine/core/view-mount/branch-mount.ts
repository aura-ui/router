/**
 * Sync mount for a resolved enter branch — root→leaf in one task, no `await` between nodes.
 *
 * @module view-mount/branch-mount
 */
import type { ApplyPreResolvedOptions } from '../../../aura-route/core/types';
import type { ViewPayload } from '../content-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { BranchResolveContext } from './branch-resolver';
import { isRenderError } from './view-commit-render';

export type MountEnterBranchResult =
  | { status: 'ok' }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown; route: MatchedRouteInfo };

/**
 * Mount all enter routes synchronously using pre-resolved view contents.
 * Pair of {@link resolveEnterBranch} — reuses the same {@link BranchResolveContext}.
 */
export function mountEnterBranch(
  enterRoutes: readonly MatchedRouteInfo[],
  preResolvedContents: readonly (ViewPayload | null)[],
  ctx: BranchResolveContext,
): MountEnterBranchResult {
  if (ctx.aborted()) return { status: 'aborted' };

  if (preResolvedContents.length !== enterRoutes.length) {
    return {
      status: 'error',
      error: new Error(
        `Branch mount: expected ${enterRoutes.length} pre-resolved contents, got ${preResolvedContents.length}`,
      ),
      route: enterRoutes[0]!,
    };
  }

  for (let i = 0; i < enterRoutes.length; i++) {
    const matchedRoute = enterRoutes[i]!;
    const data = ctx.dataFor?.(matchedRoute);
    const options: ApplyPreResolvedOptions = {
      parentSignal: ctx.signal,
      preResolvedContent: preResolvedContents[i]!,
      ...(data !== undefined && { data }),
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
