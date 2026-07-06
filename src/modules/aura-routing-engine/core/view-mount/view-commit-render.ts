/**
 * View commit render adapter during navigation (`route.render()` + abort guard).
 *
 * Vocabulary: {@link ./view-commit-state}.
 *
 * @module view-mount/view-commit-render
 */
import type { MatchedRouteInfo } from '../match/url-matcher';

export interface ViewRenderCancellation {
  readonly signal: AbortSignal;
  /** Live check — prefer `() => !transaction.isActive()` over a boolean snapshot. */
  readonly isAborted: () => boolean;
}

export type ViewRenderResult =
  | { status: 'ok' }
  | { status: 'error'; error: unknown };

export type ViewRenderErrorResult = Extract<ViewRenderResult, { status: 'error' }>;

export type ViewCommitResult =
  | 'aborted'
  | 'ok'
  | ViewRenderErrorResult;

export function isRenderError(
  result: ViewRenderResult | ViewCommitResult,
): result is ViewRenderErrorResult {
  return typeof result === 'object' && result !== null && result.status === 'error';
}

export type ViewCommitRenderOptions = {
  /** Load-hook payload for this route from DataGraph snapshot. */
  data?: unknown;
  /** Synthetic param remount on the same `<aura-route>` leaf. */
  paramChangeRemount?: boolean;
};

/** Renders the activate-branch route view; aborts when the navigation job is superseded. */
export async function runViewCommit(
  matchedRoute: MatchedRouteInfo,
  cancellation: ViewRenderCancellation,
  options?: ViewCommitRenderOptions,
): Promise<ViewCommitResult> {
  if (cancellation.isAborted()) return 'aborted';

  const result = await matchedRoute.route.render(matchedRoute, {
    parentSignal: cancellation.signal,
    ...options,
  });

  if (cancellation.isAborted()) return 'aborted';
  if (isRenderError(result)) return result;

  return 'ok';
}
