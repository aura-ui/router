import type { MatchedRouteInfo } from '../match/url-matcher';
import type { AuraRoutingProcessorJob } from './job';

export type ViewCommitResult = 'aborted' | 'ok';

/** Renders the activate-branch route view; aborts when the navigation job is superseded. */
export async function runViewCommit(
  matchedRoute: MatchedRouteInfo,
  job: AuraRoutingProcessorJob,
): Promise<ViewCommitResult> {
  if (job.aborted) return 'aborted';

  await matchedRoute.route.render(matchedRoute, { parentSignal: job.signal });

  return job.aborted ? 'aborted' : 'ok';
}
