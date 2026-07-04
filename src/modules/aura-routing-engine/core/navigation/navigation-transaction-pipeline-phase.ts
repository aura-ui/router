/**
 * Single-route lifecycle step inside {@link NavigationTransactionPipeline}:
 * route callback → registered hooks, with blocking vs post-commit policy.
 *
 * @module navigation/navigation-transaction-pipeline-phase
 */

import { NavigationTransaction } from './navigation-transaction';
import type { RouteInfo, RouteLifecycleContext, RouterInstance } from '../route/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { HistoryAction } from '../history/provider.types';
import {
  type GuardResult,
  type LifecyclePhase,
  type PhaseThrowPolicy,
  type RoutePhase,
} from '../lifecycle/types';
import { resolveHookNames } from '../lifecycle/bindings/route-hook-bindings';
import { PHASES, type PipelinePhaseDefinition } from '../lifecycle/phase-registry';
import { runPhaseHooks, type HookRegistry } from '../hooks/registry';
import { resolveRouteData } from '../data-graph/route-data';
import type { NavigationError } from '../failure';
import type { FailedNavigation } from '../failure/navigation-failure';
import type { LifecycleRuntimeContext } from '../lifecycle/orchestration/lifecycle-runtime.types';

/** Terminal outcome of one blocking hook step (cancel / redirect) or continue. */
export type PhaseStepOutcome =
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | null;

/** Structured failure handed back to the pipeline (see {@link PhaseThrowPolicy `'failure'`}). */
export type PhaseError = {
  kind: 'error';
  error: unknown;
  route: MatchedRouteInfo;
  failedPhase: LifecyclePhase;
};

/**
 * Outcome of one route × phase step.
 * - `null` — continue the pipeline
 * - {@link PhaseStepOutcome} — terminal (cancel / redirect) for blocking phases
 * - {@link PhaseError} — route-level failure for the pipeline to handle
 */
export type PhaseRunResult = PhaseStepOutcome | PhaseError | null;

type PhaseContextSource = {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
  transactionId: number;
  transactionSignal: AbortSignal;
  data?: unknown;
  error?: unknown;
};

/** Executes one {@link RoutePhaseDefinition} for a matched route within a transaction. */
export class NavigationTransactionPipelinePhase {

  /**
   * Runs the route lifecycle callback, then phase hooks from the registry.
   * Blocking phases may return cancel/redirect; post-commit phases always continue.
   */
  static async run(
    route: MatchedRouteInfo,
    phaseDef: PipelinePhaseDefinition,
    transaction: NavigationTransaction,
  ): Promise<PhaseRunResult> {
    const isBlocking = phaseDef.hookPolicy.kind === 'blocking';
    const { engine } = transaction;
    const { errorPolicy, phase, runRouteLifecycle } = phaseDef;

    const context = this.toPhaseContext(phase, route, transaction);

    // Route instance callback (onEnter, onLeave, …) from {@link RoutePhaseDefinition.runRouteLifecycle}.
    try {
      runRouteLifecycle?.(route.route, context);
    } catch (error) {
      return this.applyErrorPolicy(errorPolicy, phase, error, route);
    }

    // Declarative hooks bound via route HTML attributes / registry.
    const hookNames = resolveHookNames(route.route, phaseDef.phase) || [];

    if (isBlocking) {
      try {
        const hookResult = await runPhaseHooks(
          engine.hooksRegistry,
          context,
          hookNames,
          () => transaction.isActive(),
        );
        return this.resolveBlockingHookOutcome(hookResult);
      } catch (error) {
        return this.applyErrorPolicy(errorPolicy, phase, error, route);
      }
    }

    const hookPolicy = phaseDef.hookPolicy;
    const onHookError =
      hookPolicy.kind === 'postCommit' && hookPolicy.onError === 'log'
        ? (error: unknown) => console.error(`[${phase}] post-commit hook threw (logged, continuing):`, error)
        : (error: unknown) => {
            throw error;
          };

    try {
      await this.runLoggedPostCommitHooks(
        context,
        hookNames,
        engine.hooksRegistry,
        () => transaction.isActive(),
        phase,
        onHookError,
      );
      return null;
    } catch (error) {
      return this.applyErrorPolicy(errorPolicy, phase, error, route);
    }
  }

  /**
   * Terminal `error` recovery: `onError` + attr `error` hooks.
   * Caller supplies a normalized error and assembled {@link FailedNavigation}.
   */
  static async runError(
    route: MatchedRouteInfo,
    normalized: NavigationError,
    failed: FailedNavigation,
    context: LifecycleRuntimeContext,
  ): Promise<void> {
    const { phase, runRouteLifecycle } = PHASES.error;

    const routeData = context.dataSnapshot
      ? resolveRouteData(context.dataSnapshot, route)
      : undefined;

    const errorContext = this.buildPhaseContext(phase, route, {
      from: context.transaction.from,
      action: context.transaction.action,
      router: context.router,
      transactionId: context.transactionId,
      transactionSignal: context.transactionSignal,
      error: normalized,
      ...(routeData !== undefined && { data: routeData }),
    });

    try {
      runRouteLifecycle(route.route, errorContext);
    } catch (routeError) {
      context.reportHookError?.(routeError, failed);
    }

    const errorHooks = resolveHookNames(route.route, phase);
    if (errorHooks?.length) {
      await this.runLoggedPostCommitHooks(
        errorContext,
        errorHooks,
        context.hookRegistry,
        context.isJobActive,
        phase,
        (hookError) => context.reportHookError?.(hookError, failed),
      );
    }
  }

  /** Hook/callback context for a pipeline phase step. */
  static toPhaseContext(
    phase: RoutePhase,
    route: MatchedRouteInfo,
    transaction: NavigationTransaction,
  ): RouteLifecycleContext {
    const { engine, from, action, transactionId, signal } = transaction;
    return this.buildPhaseContext(phase, route, {
      from,
      action,
      router: engine.router,
      transactionId,
      transactionSignal: signal,
      data: transaction.dataSnapshot
        ? resolveRouteData(transaction.dataSnapshot, route)
        : undefined,
    });
  }

  /** Maps a blocking {@link GuardResult} to a terminal {@link PhaseStepOutcome}. */
  static resolveBlockingHookOutcome(hookResult: GuardResult): PhaseStepOutcome {
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

  private static async runLoggedPostCommitHooks(
    lifecycleContext: RouteLifecycleContext,
    hookNames: readonly string[],
    hookRegistry: HookRegistry,
    isJobActive: () => boolean,
    phase: RoutePhase,
    onHookError: (error: unknown) => void,
  ): Promise<void> {
    try {
      const hookResult = await runPhaseHooks(
        hookRegistry,
        lifecycleContext,
        hookNames,
        isJobActive,
      );
      this.logIgnoredPostCommitOutcome(phase, hookResult);
    } catch (error) {
      onHookError(error);
    }
  }

  static buildPhaseContext(
    phase: RoutePhase,
    route: MatchedRouteInfo,
    source: PhaseContextSource,
  ): RouteLifecycleContext {
    const { data, error, from, action, router, transactionId, transactionSignal } = source;
    return {
      phase,
      to: this.toRouteInfo(route),
      from: from ? this.toRouteInfo(from) : null,
      router,
      route: route.route,
      action,
      transactionId,
      transactionSignal,
      ...(data !== undefined && { data }),
      ...(error !== undefined && { error }),
    };
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
    phase: LifecyclePhase,
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
}
