import { resolveHookNames } from '../lifecycle/phase-attrs';
import { toLifecycleContext } from '../lifecycle/context';
import type { NavigationErrorPhase } from '../failure/navigation-error';
import { normalizeFailure } from '../failure/navigation-error';
import { FailedNavigation } from '../failure/navigation-failure';
import { runPhaseHooks } from '../hooks/registry';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { TransactionResult } from '../navigation/transaction-result';
import type { PipelineContext } from './processor-pipeline';

/** Invokes `route.onError`, error hooks, and returns `{ status: 'error' }`. */
export async function failPipelineNavigation(
  matchedRoute: MatchedRouteInfo,
  error: unknown,
  errorPhase: NavigationErrorPhase,
  pipelineContext: PipelineContext,
): Promise<Extract<TransactionResult, { status: 'error' }>> {
  const normalized = normalizeFailure(error, {
    phase: errorPhase,
    routePattern: matchedRoute.pattern,
  });

  const { transaction, router, job, commitTracker } = pipelineContext;
  const errorContext = toLifecycleContext(
    'error',
    matchedRoute,
    {
      from: transaction.from,
      action: transaction.action,
      router,
      job,
    },
    normalized,
  );
  matchedRoute.route.onError({ ...errorContext, error: normalized });

  const failed = FailedNavigation.fromPipeline(
    normalized,
    commitTracker.snapshot,
    transaction.from,
    transaction.to,
    transaction.action,
  );

  const errorHooks = resolveHookNames(matchedRoute.route, 'error');
  if (errorHooks?.length) {
    try {
      await runPhaseHooks(
        pipelineContext.hookRegistry,
        errorContext,
        errorHooks,
        pipelineContext.isJobActive,
      );
    } catch (hookError) {
      pipelineContext.reportHookError?.(hookError, failed);
    }
  }

  return failed.toResult();
}
