import {
  FailedNavigation,
  normalizeFailure,
  type NavigationErrorPhase,
} from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationLifecycleContext, PipelineStepResult } from './types';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';

/**
 * Normalize a pipeline throw into {@link FailedNavigation}, run the terminal
 * `error` phase, return `{ status: 'error' }`.
 *
 * Side effects after settle → {@link ./navigation-outcome!applyNavigationOutcome}.
 */
export async function handlePipelineFailure(
  route: MatchedRouteInfo,
  error: unknown,
  atPhase: NavigationErrorPhase,
  context: NavigationLifecycleContext,
): Promise<Extract<PipelineStepResult, { status: 'error' }>> {
  const normalized = normalizeFailure(error, {
    phase: atPhase,
    routePattern: route.pattern,
  });
  const failed = FailedNavigation.fromPipeline(
    normalized,
    context.viewCommitTracker.snapshot,
    context.transaction.from,
    context.transaction.to,
    context.transaction.action,
  );

  await NavigationTransactionPipelinePhase.runError(route, normalized, failed, context);

  return failed.toResult();
}
