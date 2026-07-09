/**
 * Parallel view/layout content resolve for an enter branch — no DOM.
 *
 * @module view-mount/branch-resolver
 */
import type { MountStrategy } from '../../../aura-route/core/attr/mount-strategy-attr-parser';
import type { DataSnapshot } from '../data-graph';
import type { TransitionMap } from '../route-tree/transition-plan';
import { isCrossOutletReplace } from '../route-tree/transition-plan';
import { resolveRouteData } from '../data-graph/route-data';
import type { ViewPayload } from '../content-graph/model/types';
import type { MatchedRouteInfo } from '../match/url-matcher';

/** Resolves view content without mounting — same contract as aura-route `ContentResolverPort`. */
export type BranchContentResolver = {
  resolve(
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    options?: { data?: unknown },
  ): Promise<ViewPayload | null>;
};

export type BranchResolveContext = {
  signal: AbortSignal;
  /**
   * Navigation cancellation check — prefer `() => !transaction.isActive()`
   * (abort + supersede), not `signal.aborted` alone.
   */
  aborted: () => boolean;
  /** Load-hook snapshot for a route (from DataGraph). */
  dataFor?: (route: MatchedRouteInfo) => unknown | undefined;
};

/** Minimal transaction surface for branch resolve (navigation pipeline). */
export type BranchResolveTransaction = {
  signal: AbortSignal;
  isActive(): boolean;
  dataSnapshot?: DataSnapshot;
};

export type BranchResolveResult =
  | { status: 'ok'; preResolvedContents: readonly (ViewPayload | null)[] }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown; route: MatchedRouteInfo };

/** Whether enter routes use prepare → commit render (parallel resolve, then sync mount root→leaf). */
export function shouldUsePrepareCommitEnterBranch(options: {
  enterRoutes: readonly MatchedRouteInfo[];
  paramChangeRemount?: boolean;
  mountStrategy?: MountStrategy | null;
  transitionPlan?: TransitionMap;
}): boolean {
  const { enterRoutes, paramChangeRemount, mountStrategy, transitionPlan } = options;

  if (paramChangeRemount) return false;
  if (enterRoutes.length === 0) return false;

  if (mountStrategy === 'per-route') return false;
  if (mountStrategy === 'branch' || mountStrategy === 'full') return true;

  if (enterRoutes.length > 1) return true;
  if (enterRoutes.some((route) => route.route.hasAsyncContent)) return true;
  if (transitionPlan && isCrossOutletReplace(transitionPlan)) return true;
  return false;
}

/** Build resolve context: `isActive()` covers abort and supersede. */
export function createBranchResolveContext(
  transaction: BranchResolveTransaction,
): BranchResolveContext {
  const { dataSnapshot } = transaction;

  return {
    signal: transaction.signal,
    aborted: () => !transaction.isActive(),
    dataFor: dataSnapshot
      ? (route) => resolveRouteData(dataSnapshot, route)
      : undefined,
  };
}

/**
 * Resolve all enter-route view contents in parallel. DOM is not touched.
 * Any loader failure fails the whole branch.
 */
export async function resolveEnterBranch(
  enterRoutes: readonly MatchedRouteInfo[],
  contentLoader: BranchContentResolver,
  ctx: BranchResolveContext,
): Promise<BranchResolveResult> {
  if (ctx.aborted()) return { status: 'aborted' };
  if (enterRoutes.length === 0) return { status: 'ok', preResolvedContents: [] };

  const outcomes = await Promise.all(
    enterRoutes.map((route) => resolveRouteOutcome(contentLoader, route, ctx)),
  );

  if (ctx.aborted()) return { status: 'aborted' };

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i]!;
    if (outcome.kind === 'error') {
      return { status: 'error', error: outcome.error, route: enterRoutes[i]! };
    }
  }

  return {
    status: 'ok',
    preResolvedContents: outcomes.map((outcome) => (outcome.kind === 'ok' ? outcome.payload : null)),
  };
}

type RouteOutcome =
  | { kind: 'ok'; payload: ViewPayload | null }
  | { kind: 'error'; error: unknown };

async function resolveRouteOutcome(
  contentLoader: BranchContentResolver,
  route: MatchedRouteInfo,
  ctx: BranchResolveContext,
): Promise<RouteOutcome> {
  if (ctx.aborted()) return { kind: 'ok', payload: null };

  try {
    const data = ctx.dataFor?.(route);
    const payload = await contentLoader.resolve(
      route,
      ctx.signal,
      data !== undefined ? { data } : undefined,
    );
    return { kind: 'ok', payload };
  } catch (error) {
    return { kind: 'error', error };
  }
}
