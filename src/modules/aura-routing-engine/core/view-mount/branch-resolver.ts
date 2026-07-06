/**
 * Parallel view/layout content resolve for an enter branch — no DOM.
 *
 * @module view-mount/branch-resolver
 */
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import type { DataSnapshot } from '../data-graph';
import { resolveRouteData } from '../data-graph/route-data';
import type { ViewPayload } from '../content/model/types';
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
  | { status: 'ok'; payloads: readonly (ViewPayload | null)[] }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown; route: MatchedRouteInfo };

/** When to resolve the full enter branch before any DOM mount. */
export function shouldUseBranchAtomic(options: {
  enterRoutes: readonly MatchedRouteInfo[];
  transitionOrder: TransitionOrderType | null;
  paramChangeRemount: boolean | undefined;
}): boolean {
  const { enterRoutes, transitionOrder, paramChangeRemount } = options;

  if (transitionOrder !== null) return false;
  if (paramChangeRemount) return false;
  if (enterRoutes.length === 0) return false;
  if (enterRoutes.length > 1) return true;
  return enterRoutes[0]!.route.hasAsyncContent;
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
 * Resolve all enter-route payloads in parallel. DOM is not touched.
 * Any loader failure fails the whole branch.
 */
export async function resolveEnterBranch(
  enterRoutes: readonly MatchedRouteInfo[],
  resolver: BranchContentResolver,
  ctx: BranchResolveContext,
): Promise<BranchResolveResult> {
  if (ctx.aborted()) return { status: 'aborted' };
  if (enterRoutes.length === 0) return { status: 'ok', payloads: [] };

  const outcomes = await Promise.all(
    enterRoutes.map((route) => resolveRouteOutcome(resolver, route, ctx)),
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
    payloads: outcomes.map((outcome) => (outcome.kind === 'ok' ? outcome.payload : null)),
  };
}

type RouteOutcome =
  | { kind: 'ok'; payload: ViewPayload | null }
  | { kind: 'error'; error: unknown };

async function resolveRouteOutcome(
  resolver: BranchContentResolver,
  route: MatchedRouteInfo,
  ctx: BranchResolveContext,
): Promise<RouteOutcome> {
  if (ctx.aborted()) return { kind: 'ok', payload: null };

  try {
    const data = ctx.dataFor?.(route);
    const payload = await resolver.resolve(
      route,
      ctx.signal,
      data !== undefined ? { data } : undefined,
    );
    return { kind: 'ok', payload };
  } catch (error) {
    return { kind: 'error', error };
  }
}
