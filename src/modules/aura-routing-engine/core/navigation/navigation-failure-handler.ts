import {
  FailedNavigation,
  normalizeFailure,
  type NavigationErrorPhase,
} from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationLifecycleContext, PipelineStepResult } from './types';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';

/** Assembles a pipeline failure and runs the terminal `error` phase. */
export class NavigationFailureHandler {
  static async handle(
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
}
