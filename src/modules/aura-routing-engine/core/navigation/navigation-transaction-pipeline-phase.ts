/**
 * Single-route lifecycle step inside {@link NavigationTransactionPipeline}:
 * route callback → registered hooks, with blocking vs post-commit policy.
 *
 * @module navigation/navigation-transaction-pipeline-phase
 */

import { NavigationTransaction } from './navigation-transaction';
import type { RouteInfo, RouteLifecycleContext } from '../route/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  type GuardResult,
  type PhaseStepOutcome, type PhaseThrowPolicy,
  resolveHookNames,
  type RoutePhase,
  type RoutePhaseDefinition,
} from '../lifecycle';
import { runPhaseHooks } from '../hooks/registry';
import { resolveRouteData } from '../data-graph';

/** Structured failure handed back to the pipeline (see {@link PhaseThrowPolicy `'failure'`}). */
export type PhaseError = {
  kind: 'error';
  error: unknown;
  route: MatchedRouteInfo;
  failedPhase: RoutePhase;
};

/**
 * Outcome of one route × phase step.
 * - `null` — continue the pipeline
 * - {@link PhaseStepOutcome} — terminal (cancel / redirect) for blocking phases
 * - {@link PhaseError} — route-level failure for the pipeline to handle
 */
export type PhaseRunResult = PhaseStepOutcome | PhaseError | null;

/** Executes one {@link RoutePhaseDefinition} for a matched route within a transaction. */
export class NavigationTransactionPipelinePhase {

  /**
   * Runs the route lifecycle callback, then phase hooks from the registry.
   * Blocking phases may return cancel/redirect; post-commit phases always continue.
   */
  static async run(
    route: MatchedRouteInfo,
    phaseDef: RoutePhaseDefinition,
    transaction: NavigationTransaction,
  ): Promise<PhaseRunResult> {
    const isBlocking = phaseDef.hookPolicy.kind === 'blocking';
    const { engine } = transaction;
    const { errorPolicy, phase, runRouteLifecycle } = phaseDef;

    const context: RouteLifecycleContext = this.toPipelinePhaseContext(phase, route, transaction);

    // Route instance callback (onEnter, onLeave, …) from {@link RoutePhaseDefinition.runRouteLifecycle}.
    try {
      runRouteLifecycle?.(route.route, context);
    } catch (error) {
      return this.applyErrorPolicy(errorPolicy, phase, error, route);
    }

    // Declarative hooks bound via route HTML attributes / registry.
    try {
      const hookResult = await runPhaseHooks(
        engine.hooksRegistry,
        context,
        resolveHookNames(route.route, phaseDef.phase) || [],
        () => transaction.isActive(),
      );

      if (isBlocking) {
        return this.resolveBlockingHookOutcome(hookResult);
      }

      this.logIgnoredPostCommitOutcome(phase, hookResult);
      return null;

    } catch (error) {
      if (isBlocking || phaseDef.hookPolicy.onError !== 'log') {
        return this.applyErrorPolicy(errorPolicy, phase, error, route);
      }
      console.error(`[${phase}] post-commit hook threw (logged, continuing):`, error);
      return null;
    }
  }

  /** Maps a blocking {@link GuardResult} to a terminal {@link PhaseStepOutcome}. */
  private static resolveBlockingHookOutcome(hookResult: GuardResult): PhaseStepOutcome {
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

  /** Post-commit hooks cannot cancel or redirect — log and discard non-void results. */
  private static logIgnoredPostCommitOutcome(
    phase: RoutePhase,
    hookResult: GuardResult,
  ): void {
    if (hookResult === false) {
      console.warn(`[${phase}] post-commit hook returned false — ignored`);
      return;
    }

    const redirect = this.resolveBlockingHookOutcome(hookResult);
    if (redirect?.status === 'redirect') {
      console.warn(`[${phase}] post-commit hook returned redirect — ignored: ${redirect.url}`);
    }
  }

  private static toRouteInfo(matchedRoute: MatchedRouteInfo): RouteInfo {
    return {
      pathname: matchedRoute.pathname,
      ...(matchedRoute.params && { params: matchedRoute.params }),
      ...(matchedRoute.query && { query: matchedRoute.query }),
    };
  }

  /** Applies {@link PhaseThrowPolicy} when a lifecycle callback or hook throws. */
  private static applyErrorPolicy(
    errorPolicy: PhaseThrowPolicy,
    phase: RoutePhase,
    error: unknown,
    route: MatchedRouteInfo,
  ): PhaseRunResult {
    if (errorPolicy === 'log') {
      console.error(`[${phase}] phase threw (logged, continuing pipeline):`, error);
      return null;
    }
    if (errorPolicy === 'propagate') {
      throw (error);
    }

    return { kind: 'error', error, route, failedPhase: phase };
  }

  static isPhaseError(r: PhaseRunResult): r is PhaseError {
    return r !== null && typeof r === 'object' && 'kind' in r && r.kind === 'error';
  }

  /** Builds {@link RouteLifecycleContext} for pipeline-driven phases. */
  static toPipelinePhaseContext(
    phase: RoutePhase,
    route: MatchedRouteInfo,
    transaction: NavigationTransaction,
  ): RouteLifecycleContext {
    const { engine, from, action, transactionId, signal } = transaction;
    return {
      phase: phase,
      to: this.toRouteInfo(route),
      from: from ? this.toRouteInfo(from) : null,
      router: engine.router,
      route: route.route,
      action,
      jobId: transactionId,
      signal,
      data: transaction.dataSnapshot ? resolveRouteData(transaction.dataSnapshot, route) : undefined,
    };
  }
}
