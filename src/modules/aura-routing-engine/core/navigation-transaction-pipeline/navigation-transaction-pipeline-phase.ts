import { NavigationTransaction } from '../navigation-transaction/navigation-transaction';
import type { RouteErrorContext, RouteInfo, RouteLifecycleContext } from '../route/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  type GuardResult,
  type PhaseStepOutcome, type PhaseThrowPolicy,
  resolveHookNames,
  type RoutePhase,
  type RoutePhaseDefinition,
} from '../lifecycle';
import { runPhaseHooks } from '../hooks/registry';
import type { TransactionFullResult } from './navigation-transaction-pipeline';

export type PhaseError = {
  kind: 'error';
  error: unknown;
  route: MatchedRouteInfo;
  failedPhase: RoutePhase;
};

export type PhaseRunResult = PhaseStepOutcome | PhaseError | null;

export class NavigationTransactionPipelinePhase {

  static async run(route: MatchedRouteInfo, data: RoutePhaseDefinition, transaction: NavigationTransaction): Promise<TransactionFullResult> {
    const isBlocking = data.hookPolicy.kind === 'blocking';
    const { engine } = transaction;
    const { errorPolicy, phase, runRouteLifecycle } = data;

    const context: RouteLifecycleContext = this.toPipelinePhaseContext(phase, route, transaction);

    // run route onFunctions
    try {
      runRouteLifecycle && runRouteLifecycle(route.route, context);
    } catch (error) {
      return this.onThrow(errorPolicy, phase, error, route);
    }

    // run route hooks defined inside route html attributes
    try {
      const hookResult = await runPhaseHooks(
        engine.hooksRegistry,
        context,
        resolveHookNames(route.route, data.phase) || [],
        transaction.transactionRejected,
      );

      if (isBlocking) {
        return this.processBlockingResult(hookResult);
      }

      this.validatePostCommitResult(data.phase, hookResult);
      return null;

    } catch (error) {
      if (isBlocking || data.hookPolicy.onError !== 'log') {
        return this.onThrow(errorPolicy, phase, error, route);
      }
      console.error(`[${phase}] hook failed after view commit:`, error);
      return null;
    }
  }


  private static processBlockingResult(hookResult: GuardResult): PhaseStepOutcome {
    if (hookResult === false) return { status: 'cancelled' };

    if (typeof hookResult === 'string') {
      return { status: 'redirect', url: hookResult };
    }

    if (hookResult && typeof hookResult === 'object' && 'url' in hookResult) {
      return {
        status: 'redirect',
        url: hookResult.url,
        ...(hookResult.replace !== undefined && { replace: hookResult.replace }),
      };
    }

    return null;
  }

  private static validatePostCommitResult(
    phase: RoutePhase,
    hookResult: GuardResult,
  ): void {
    if (hookResult === false) {
      console.warn(`[${phase}] hook returned false after view commit — ignored`);
      return;
    }

    const redirect = this.processBlockingResult(hookResult);
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
    if (errorPolicy === 'propagate') {
      throw (error);
    }

    // failure — отдаём управление pipeline
    return { kind: 'error', error, route, failedPhase: phase };
  }

  static isPhaseError(r: PhaseRunResult): r is PhaseError {
    return r !== null && typeof r === 'object' && 'kind' in r && r.kind === 'error';
  }

  static toPipelinePhaseContext(phase: RoutePhase, route: MatchedRouteInfo, transaction: NavigationTransaction) {
    const { engine, from, action, id, signal } = transaction;
    return {
      phase: phase,
      to: this.toRouteInfo(route),
      from: from ? this.toRouteInfo(from) : null,
      router: engine.router,
      route: route.route,
      action,
      jobId: id, // todo rename
      signal,
      /** Load-hook payload from DataGraph when available for this route/phase. */
      // data?: unknown;
      // error?: unknown;
    };
  }

  static async runError(
    route: MatchedRouteInfo,
    error: unknown,
    failedPhase: RoutePhase,
    transaction: NavigationTransaction,
  ): Promise<void> {
    const context: RouteErrorContext = { ...this.toPipelinePhaseContext('error', route, transaction), error };

    try {
      route.route.onError(context);
    } catch (e) {
      console.error('[error] onError threw:', e);
    }

    await runPhaseHooks(
      transaction.engine.hooksRegistry,
      context,
      resolveHookNames(route.route, 'error') || [],
      transaction.transactionRejected,
    );
  }
}