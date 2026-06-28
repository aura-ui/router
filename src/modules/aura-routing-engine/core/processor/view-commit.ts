import type { MatchedRouteInfo } from '../match/url-matcher';
import type { AuraRoutingProcessorJob } from './job';

export type ViewRenderResult =
  | { status: 'ok' }
  | { status: 'error'; error: unknown };

export type ViewCommitResult = 'aborted' | 'ok' | ViewRenderResult;

export function isRenderError(
  result: ViewCommitResult,
): result is Extract<ViewRenderResult, { status: 'error' }> {
  return typeof result === 'object' && result !== null && result.status === 'error';
}

/** Renders the activate-branch route view; aborts when the navigation job is superseded. */
export async function runViewCommit(
  matchedRoute: MatchedRouteInfo,
  job: AuraRoutingProcessorJob,
): Promise<ViewCommitResult> {
  if (job.aborted) return 'aborted';

  const result = await matchedRoute.route.render(matchedRoute, { parentSignal: job.signal });

  if (job.aborted) return 'aborted';
  if (isRenderError(result)) return result;

  return 'ok';
}
