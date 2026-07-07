import {
  FailedNavigation,
  normalizeFailure,
  type NavigationErrorPhase,
} from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { LifecycleRuntimeContext } from './types';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';
import type { TransactionFullResult } from './transaction-result';

/** Assembles a pipeline failure and runs the terminal `error` phase. */
export class NavigationFailureHandler {
  static async handle(
    route: MatchedRouteInfo,
    error: unknown,
    atPhase: NavigationErrorPhase,
    context: LifecycleRuntimeContext,
  ): Promise<Extract<TransactionFullResult, { status: 'error' }>> {
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
