/**
 * Parallel view/layout content resolve for an enter branch — no DOM.
 *
 * @module view-mount/branch-resolver
 */
import type { DataSnapshot } from '../data-graph';
import { resolveRouteData } from '../data-graph/route-data';
import type { BranchViewResolver, ViewPayload } from '../view-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';

export type { BranchViewResolver } from '../view-graph';

export type BranchResolveContext = {
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

/** Minimal transaction surface for branch resolve (navigation pipeline). */
export type BranchResolveTransaction = {
  signal: AbortSignal;
  isActive(): boolean;
  dataSnapshot?: DataSnapshot;
  paramChangeRemount?: boolean;
};

export type BranchResolveResult =
  | { status: 'ok'; preResolvedContents: readonly (ViewPayload | null)[] }
  | { status: 'aborted' }
  | { status: 'error'; error: unknown; route: MatchedRouteInfo };


/** Build resolve context: `isActive()` covers abort and supersede. */
export function createBranchResolveContext(
  transaction: BranchResolveTransaction,
): BranchResolveContext {
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

/**
 * Resolve all enter-route view contents in parallel. DOM is not touched.
 * Any loader failure fails the whole branch.
 */
export async function resolveEnterBranch(
  enterRoutes: readonly MatchedRouteInfo[],
  contentLoader: BranchViewResolver,
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
  contentLoader: BranchViewResolver,
  route: MatchedRouteInfo,
  ctx: BranchResolveContext,
): Promise<RouteOutcome> {
  if (ctx.aborted()) return { kind: 'ok', payload: null };

  try {
    const data = ctx.dataFor?.(route);
    const payload = await contentLoader.loadView(
      route,
      ctx.signal,
      data !== undefined ? { data } : undefined,
    );
    return { kind: 'ok', payload };
  } catch (error) {
    return { kind: 'error', error };
  }
}
