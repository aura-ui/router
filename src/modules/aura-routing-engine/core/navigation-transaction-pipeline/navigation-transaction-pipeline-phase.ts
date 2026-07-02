import { NavigationTransaction } from '../navigation-transaction/navigation-transaction';
import type { RouteErrorContext, RouteInfo, RouteLifecycleContext } from '../route/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  type GuardResult,
  guardResultToPhaseOutcome, type PhaseStepOutcome, type PhaseThrowPolicy,
  resolveHookNames,
  type RoutePhase,
  type RoutePhaseDefinition,
} from '../lifecycle';
import { runPhaseHooks } from '../hooks/registry';


export type PhaseError = {
  kind: 'error';
  error: unknown;
  route: MatchedRouteInfo;
  failedPhase: RoutePhase;
};
export type PhaseRunResult = PhaseStepOutcome | PhaseError | null;


export class NavigationTransactionPipelinePhase {

  static async run(route: MatchedRouteInfo, data: RoutePhaseDefinition, transaction: NavigationTransaction) {
    const isBlocking = data.hookPolicy.kind === 'blocking';
    const { engine, from, action, id, signal } = transaction;
    const { router } = engine;
    const { errorPolicy, phase } = data;

    const context: RouteLifecycleContext = {
      phase: phase,
      to: this.toRouteInfo(route),
      from: from ? this.toRouteInfo(from) : null,
      router,
      route: route.route,
      action,
      jobId: id, // todo rename
      signal,
      /** Load-hook payload from DataGraph when available for this route/phase. */
      // data?: unknown;
      // error?: unknown;
    };

    try {
      data.runRouteLifecycle && data.runRouteLifecycle(route.route, context);
    } catch (error) {
      return this.onThrow(errorPolicy, phase, error, route);
    }

    try {
      const hookResult = await runPhaseHooks(
        engine.hooksRegistry,
        context,
        resolveHookNames(route.route, data.phase) || [],
        transaction.transactionRejected,
      );

      if (isBlocking) {
        return guardResultToPhaseOutcome(hookResult);
      }

      this.warnIgnoredPostCommitHookResult(data.phase, hookResult);
      return null;

    } catch (error) {
      return this.onThrow(errorPolicy, phase, error, route);
    }

  }

  private static warnIgnoredPostCommitHookResult(
    phase: RoutePhase,
    hookResult: GuardResult,
  ): void {
    if (hookResult === false) {
      console.warn(`[${phase}] hook returned false after view commit — ignored`);
      return;
    }

    const redirect = guardResultToPhaseOutcome(hookResult);
    if (redirect?.status === 'redirect') {
      console.warn(`[${phase}] hook returned redirect after view commit — ignored: ${redirect.url}`);
    }
  }

  private static toRouteInfo(matchedRoute: MatchedRouteInfo): RouteInfo {
    return {
      pathname: matchedRoute.pathname,
      ...(matchedRoute.params && { params: matchedRoute.params }),
      ...(matchedRoute.query && { query: matchedRoute.query }),
    };
  }

  private static onThrow(
    errorPolicy: PhaseThrowPolicy,
    phase: RoutePhase,
    error: unknown,
    route: MatchedRouteInfo,
  ): PhaseRunResult {
    if (errorPolicy === 'log') {
      console.error(`[${phase}] failed after commit:`, error);
      return null; // left/after — log и идём дальше
    }
    // failure — отдаём управление pipeline
    return { kind: 'error', error, route, failedPhase: phase };
  }

  static isPhaseError(r: PhaseRunResult): r is PhaseError {
    return r !== null && typeof r === 'object' && 'kind' in r && r.kind === 'error';
  }

  static async runError(
    route: MatchedRouteInfo,
    error: unknown,
    failedPhase: RoutePhase,
    transaction: NavigationTransaction,
  ): Promise<void> {
    const { engine, from, action, id, signal } = transaction;

    const context: RouteErrorContext = {
      phase: 'error',
      error,
      to: this.toRouteInfo(route),
      from: from ? this.toRouteInfo(from) : null,
      router: engine.router,
      route: route.route,
      action,
      jobId: id,
      signal,
      // data?: ...
    };

    try {
      route.route.onError(context);
    } catch (e) {
      console.error('[error] onError threw:', e);
    }

    await runPhaseHooks(
      engine.hooksRegistry,
      context,
      resolveHookNames(route.route, 'error') || [],
      transaction.transactionRejected,
    );
  }
}