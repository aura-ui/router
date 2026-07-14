/**
 * Single-route lifecycle step inside {@link NavigationTransactionPipeline}:
 * route callback → registered hooks, with blocking vs post-commit policy.
 *
 * @module navigation/navigation-transaction-pipeline-phase
 */

import { NavigationTransaction } from './navigation-transaction';
import type { GuardResult } from '../guard.types';
import type { RouteInfo, RouteLifecycleContext, RoutePhase, LifecyclePhase } from '../route/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type {
  BlockingHookStepResult,
  NavigationLifecycleContext,
  PipelinePhaseDefinition, PipelineStepResult,
  RoutePhaseContextInput,
  RoutePhaseFailure,
  RoutePhaseRunResult,
  RoutePhaseThrowPolicy,
} from './types';
import { resolveHookNames } from '../hooks/resolve-hook-names';
import { PHASES } from './lifecycle-phases';
import { runPhaseHooks, type HookRegistry } from '../hooks/registry';
import { resolveRouteData } from '../data-graph/route-data';
import type { NavigationError } from '../failure';
import type { FailedNavigation } from '../failure/navigation-failure';

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
  ): Promise<RoutePhaseRunResult> {
    const isBlocking = phaseDef.hookPolicy.kind === 'blocking';
    const { engine } = transaction;
    const { errorPolicy, phase, runRouteLifecycle } = phaseDef;

    const context = this.toPhaseContext(phase, route, transaction);

    // 1. Route callback (onGuard, onLeave, …)
    try {
      runRouteLifecycle(route.route, context);
    } catch (error) {
      return this.applyErrorPolicy(errorPolicy, phase, error, route);
    }

    const hookNames = resolveHookNames(route.route, phaseDef.phase) ?? [];

    // 2. Blocking hooks — cancel/redirect stops navigation
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

    // 3. Post-commit hooks — cancel/redirect ignored; errors per hookPolicy.onError
    const { hookPolicy } = phaseDef;
    const onHookError =
      hookPolicy.kind !== 'blocking' && hookPolicy.onError === 'log'
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
    context: NavigationLifecycleContext,
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
    if (!errorHooks?.length) return;

    await this.runLoggedPostCommitHooks(
      errorContext,
      errorHooks,
      context.hookRegistry,
      context.isJobActive,
      phase,
      (hookError) => context.reportHookError?.(hookError, failed),
    );
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

  static buildPhaseContext(
    phase: RoutePhase,
    route: MatchedRouteInfo,
    source: RoutePhaseContextInput,
  ): RouteLifecycleContext {
    const { data, error, from, action, router, transactionId, transactionSignal, parent } = source;
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
      ...(parent !== undefined && { parent }),
      ...(error !== undefined && { error }),
    };
  }

  static isRoutePhaseFailure(r: RoutePhaseRunResult): r is RoutePhaseFailure {
    return r !== null && typeof r === 'object' && 'status' in r && r.status === 'phaseFailed';
  }

  /** Maps a blocking {@link GuardResult} to a {@link BlockingHookStepResult}. */
  static resolveBlockingHookOutcome(hookResult: GuardResult): BlockingHookStepResult {
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

  static resolveLoadHookOutcome(result: unknown): PipelineStepResult {
    if (result === false) return { status: 'cancelled' };
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

  private static toRouteInfo(matchedRoute: MatchedRouteInfo): RouteInfo {
    return {
      pathname: matchedRoute.pathname,
      ...(matchedRoute.params && { params: matchedRoute.params }),
      ...(matchedRoute.query && { query: matchedRoute.query }),
    };
  }

  /** Applies {@link RoutePhaseThrowPolicy} when a lifecycle callback or hook throws. */
  private static applyErrorPolicy(
    errorPolicy: RoutePhaseThrowPolicy,
    phase: LifecyclePhase,
    error: unknown,
    route: MatchedRouteInfo,
  ): RoutePhaseRunResult {
    if (errorPolicy === 'log') {
      console.error(`[${phase}] phase threw (logged, continuing pipeline):`, error);
      return null;
    }
    if (errorPolicy === 'propagate') {
      throw error;
    }

    return { status: 'phaseFailed', error, route, phase };
  }
}
