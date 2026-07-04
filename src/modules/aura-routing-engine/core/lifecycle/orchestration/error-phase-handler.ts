import { resolveRouteData } from '../../data-graph/route-data';
import {
  FailedNavigation,
  normalizeFailure,
  type NavigationError,
  type NavigationErrorPhase,
} from '../../failure';
import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { NavigationErrorResult } from '../../navigation/transaction-result';
import { NavigationTransactionPipelinePhase } from '../../navigation/navigation-transaction-pipeline-phase';
import type { RouteErrorContext } from '../../route/types';
import { resolveHookNames } from '../bindings/route-hook-bindings';
import { HookPolicyExecutor } from '../execution/hook-policy-executor';
import { PHASES } from '../phase-registry';

import type { LifecycleRuntimeContext } from './lifecycle-runtime.types';

/** Handles route `error` lifecycle callbacks and registered error hooks. */
export class ErrorPhaseHandler {
  private readonly hookPolicies: HookPolicyExecutor;

  constructor(hookPolicies = new HookPolicyExecutor()) {
    this.hookPolicies = hookPolicies;
  }

  async failNavigation(
    matchedRoute: MatchedRouteInfo,
    error: unknown,
    errorPhase: NavigationErrorPhase,
    context: LifecycleRuntimeContext,
  ): Promise<NavigationErrorResult> {
    const normalized = normalizeFailure(error, {
      phase: errorPhase,
      routePattern: matchedRoute.pattern,
    });
    const failed = this.createFailedNavigation(normalized, context);
    const routeData = context.dataSnapshot
      ? resolveRouteData(context.dataSnapshot, matchedRoute)
      : undefined;
    const errorContext = NavigationTransactionPipelinePhase.buildPhaseContext(
      PHASES.error.phase,
      matchedRoute,
      {
        from: context.transaction.from,
        action: context.transaction.action,
        router: context.router,
        transactionId: context.transactionId,
        transactionSignal: context.transactionSignal,
        error: normalized,
        ...(routeData !== undefined && { data: routeData }),
      },
    ) as RouteErrorContext;

    this.runRouteErrorLifecycle(matchedRoute, errorContext, failed, context);
    await this.runErrorHooks(matchedRoute, errorContext, failed, context);

    return failed.toResult();
  }

  private createFailedNavigation(
    error: NavigationError,
    context: LifecycleRuntimeContext,
  ): FailedNavigation {
    return FailedNavigation.fromPipeline(
      error,
      context.viewCommitTracker.snapshot,
      context.transaction.from,
      context.transaction.to,
      context.transaction.action,
    );
  }

  private runRouteErrorLifecycle(
    matchedRoute: MatchedRouteInfo,
    errorContext: RouteErrorContext,
    failed: FailedNavigation,
    context: LifecycleRuntimeContext,
  ): void {
    try {
      matchedRoute.route.onError(errorContext);
    } catch (routeError) {
      context.reportHookError?.(routeError, failed);
    }
  }

  private async runErrorHooks(
    matchedRoute: MatchedRouteInfo,
    errorContext: RouteErrorContext,
    failed: FailedNavigation,
    context: LifecycleRuntimeContext,
  ): Promise<void> {
    const errorHooks = resolveHookNames(matchedRoute.route, PHASES.error.phase);
    if (!errorHooks?.length) return;

    await this.hookPolicies.runPostCommit(
      errorContext,
      {
        hookRegistry: context.hookRegistry,
        isJobActive: context.isJobActive,
      },
      errorHooks,
      PHASES.error.hookPolicy.onError,
      PHASES.error.phase,
      {
        onLoggedError: (hookError) => context.reportHookError?.(hookError, failed),
      },
    );
  }
}
