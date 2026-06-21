// Выполняет фазы navigation transaction.
//
// Processor: runGuards → runLoads → runTransition → runPostCommit
//
// Lifecycle — всегда; hooks — только при непустом attr на route.

import type { MatchedRouteInfo } from './aura-routing-url-matcher';
import type { HistoryAction } from './navigation-provider.types';
import type { TransitionMap } from './aura-routing-transition-map';
import type { AuraRoutingProcessorJob } from './aura-routing-processor-job';
import { AuraRoutingPhaseHandler } from './aura-routing-phase-handler';
import type { GuardResult } from './types';
import type { RoutePhase, RouteInfo, RouteLifecycleContext, RouterInstance } from '../../aura-route-hooks/core';
import type { TransitionPolicy } from './aura-routing-transition-policy';
import type { NavigationErrorPhase } from './navigation-error.types';

export interface NavigationTransaction {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  plan: TransitionMap;
  transitionPolicy: TransitionPolicy;
}

export interface PhaseContext {
  transaction: NavigationTransaction;
  job: AuraRoutingProcessorJob;
  router: RouterInstance;
  isJobActive: () => boolean;
}

export type TransactionResult =
  | { status: 'committed' }
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | { status: 'error'; error: unknown; phase: NavigationErrorPhase; committed: boolean };

type PhaseOutcome = TransactionResult | null;

type RedirectResult = Extract<TransactionResult, { status: 'redirect' }>;

export class PhaseExecutor {
  async runReenter(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of phaseContext.transaction.plan.enterRoutes) {
      const { route } = routeInfo;
      const lifecycleContext = toLifecycleContext('reenter', routeInfo, phaseContext);

      try {
        route.onReenter(lifecycleContext);

        if (route.reenter?.length) {
          const result = await AuraRoutingPhaseHandler.runPhase(lifecycleContext, phaseContext.isJobActive);
          this.warnIgnoredTerminalResult('reenter', result);
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, phaseContext, 'reenter');
      }
    }

    return null;
  }

  async runGuards(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    const { plan } = phaseContext.transaction;

    for (const routeInfo of plan.exitRoutes) {
      const { route } = routeInfo;
      const lifecycleContext = toLifecycleContext('leave', routeInfo, phaseContext);

      try {
        route.onLeave(lifecycleContext);
        if (route.leave?.length) {
          const blocked = await this.runBlockingPhase(
            () => AuraRoutingPhaseHandler.runPhase(lifecycleContext, phaseContext.isJobActive),
          );
          if (blocked) return blocked;
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, phaseContext, 'leave');
      }
    }

    for (const routeInfo of plan.enterRoutes) {
      const { route } = routeInfo;
      const lifecycleContext = toLifecycleContext('enter', routeInfo, phaseContext);

      try {
        route.onEnter(lifecycleContext);
        if (route.enter?.length) {
          const outcome = await this.runBlockingPhase(
            () => AuraRoutingPhaseHandler.runPhase(lifecycleContext, phaseContext.isJobActive),
          );
          if (outcome) return outcome;
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, phaseContext, 'enter');
      }
    }

    return null;
  }

  async runLoads(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of phaseContext.transaction.plan.enterRoutes) {
      const { route } = routeInfo;
      const lifecycleContext = toLifecycleContext('load', routeInfo, phaseContext);

      try {
        route.onLoad(lifecycleContext);
        if (route.load?.length) {
          const outcome = await this.runBlockingPhase(
            () => AuraRoutingPhaseHandler.runPhase(lifecycleContext, phaseContext.isJobActive),
          );
          if (outcome) return outcome;
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, phaseContext, 'load');
      }
    }

    return null;
  }

  /**
   * View commit (render) + transition effects (`transition-out` / `transition-in`) по {@link TransitionPolicy}.
   *
   * out-in:     transition-out → render → transition-in
   * in-out:     render → transition-in → transition-out
   * parallel:   render → transition-out ‖ transition-in
   */
  async runTransition(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    switch (phaseContext.transaction.transitionPolicy) {
      case 'out-in':
        return this.runOutIn(phaseContext);
      case 'in-out':
        return this.runInOut(phaseContext);
      case 'parallel':
        return this.runParallel(phaseContext);
    }
  }

  /** Cleanup после commit: `left`, `entered`. */
  async runPostCommit(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    await this.runExitCleanup(phaseContext);

    for (const routeInfo of phaseContext.transaction.plan.enterRoutes) {
      const { route } = routeInfo;
      const lifecycleContext = toLifecycleContext('entered', routeInfo, phaseContext);

      route.onEntered(lifecycleContext);

      if (route.entered?.length) {
        const result = await this.runPhaseSafe(lifecycleContext, phaseContext);
        this.warnIgnoredTerminalResult('entered', result);
      }
    }

    return null;
  }

  private async runOutIn(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    const transitionOut = await this.runExitTransition(phaseContext);
    if (transitionOut) return transitionOut;

    const commit = await this.runCommit(phaseContext);
    if (commit) return commit;

    return this.runEnterTransition(phaseContext);
  }

  private async runInOut(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    const commit = await this.runCommit(phaseContext);
    if (commit) return commit;

    const transitionIn = await this.runEnterTransition(phaseContext);
    if (transitionIn) return transitionIn;

    return this.runExitTransition(phaseContext);
  }

  private async runParallel(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    const commit = await this.runCommit(phaseContext);
    if (commit) return commit;

    const [transitionOut, transitionIn] = await Promise.all([
      this.runExitTransition(phaseContext),
      this.runEnterTransition(phaseContext),
    ]);

    return transitionOut ?? transitionIn ?? null;
  }

  private async runExitTransition(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of phaseContext.transaction.plan.exitRoutes) {
      const { route } = routeInfo;
      const lifecycleContext = toLifecycleContext('transitionOut', routeInfo, phaseContext);

      try {
        route.onTransitionOut(lifecycleContext);
        if (route.transitionOut?.length) {
          const result = await AuraRoutingPhaseHandler.runPhase(lifecycleContext, phaseContext.isJobActive);
          this.warnIgnoredTerminalResult('transitionOut', result);
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, phaseContext, 'transitionOut');
      }
    }

    return null;
  }

  private async runEnterTransition(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of phaseContext.transaction.plan.enterRoutes) {
      const { route } = routeInfo;
      const lifecycleContext = toLifecycleContext('transitionIn', routeInfo, phaseContext);

      try {
        route.onTransitionIn(lifecycleContext);
        if (route.transitionIn?.length) {
          const result = await AuraRoutingPhaseHandler.runPhase(lifecycleContext, phaseContext.isJobActive);
          this.warnIgnoredTerminalResult('transitionIn', result);
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, phaseContext, 'transitionIn');
      }
    }

    return null;
  }

  private async runCommit(phaseContext: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of phaseContext.transaction.plan.enterRoutes) {
      try {
        const response = await AuraRoutingPhaseHandler.runRenderPhase(routeInfo, phaseContext.job);

        if (response === 'aborted' || !phaseContext.isJobActive()) {
          return { status: 'cancelled' };
        }
      } catch (error) {
        await this.runExitCleanup(phaseContext);
        return this.failWithError(routeInfo, error, phaseContext, 'render');
      }
    }

    return null;
  }

  /** Скрывает deactivate-ветку после успешного render или render-error. */
  private async runExitCleanup(phaseContext: PhaseContext): Promise<void> {
    for (const routeInfo of phaseContext.transaction.plan.exitRoutes) {
      const { route } = routeInfo;
      const lifecycleContext = toLifecycleContext('left', routeInfo, phaseContext);

      route.onLeft(lifecycleContext);
      if (route.left?.length) {
        const result = await this.runPhaseSafe(lifecycleContext, phaseContext);
        this.warnIgnoredTerminalResult('left', result);
      }
    }
  }

  private async runBlockingPhase(
    run: () => Promise<GuardResult>,
  ): Promise<TransactionResult | false> {
    const result = await run();
    if (result === false) return { status: 'cancelled' };
    return this.applyRedirect(result);
  }

  private applyRedirect(result: GuardResult): RedirectResult | false {
    if (typeof result === 'string') {
      return { status: 'redirect', url: result };
    }

    if (result && typeof result === 'object' && 'url' in result) {
      return {
        status: 'redirect',
        url: result.url,
        ...(result.replace !== undefined && { replace: result.replace }),
      };
    }

    return false;
  }

  /** Post-commit: cancel/redirect не меняют траекторию навигации (NAVIGATION_TRANSACTION_MODEL). */
  private warnIgnoredTerminalResult(phase: RoutePhase, result: GuardResult): void {
    if (result === false) {
      console.warn(`[${phase}] hook returned false after commit — ignored`);
      return;
    }

    const redirect = this.applyRedirect(result);
    if (redirect) {
      console.warn(`[${phase}] hook returned redirect after commit — ignored: ${redirect.url}`);
    }
  }

  private async failWithError(
    routeInfo: MatchedRouteInfo,
    error: unknown,
    phaseContext: PhaseContext,
    failedPhase: NavigationErrorPhase,
  ): Promise<Extract<TransactionResult, { status: 'error' }>> {
    const errorContext = toLifecycleContext('error', routeInfo, phaseContext, error);
    routeInfo.route.onError({ ...errorContext, error });

    if (routeInfo.route.error?.length) {
      try {
        await AuraRoutingPhaseHandler.runPhase(errorContext, phaseContext.isJobActive);
      } catch (hookError) {
        console.error(hookError);
      }
    }

    return {
      status: 'error',
      error,
      phase: failedPhase,
      committed: failedPhase === 'render',
    };
  }

  private async runPhaseSafe(
    lifecycleContext: RouteLifecycleContext,
    phaseContext: PhaseContext,
  ): Promise<GuardResult> {
    try {
      return await AuraRoutingPhaseHandler.runPhase(lifecycleContext, phaseContext.isJobActive);
    } catch (error) {
      console.error(`[${lifecycleContext.phase}] hook failed after commit:`, error);
      return undefined;
    }
  }
}

function toRouteInfo(m: MatchedRouteInfo): RouteInfo {
  return {
    path: m.pathname,
    ...(m.params && { params: m.params }),
    ...(m.query && { query: m.query }),
  };
}

export function toLifecycleContext(
  phase: RoutePhase,
  routeInfo: MatchedRouteInfo,
  phaseContext: PhaseContext,
  error?: unknown,
): RouteLifecycleContext {
  return {
    phase,
    from: phaseContext.transaction.from ? toRouteInfo(phaseContext.transaction.from) : null,
    to: toRouteInfo(routeInfo),
    router: phaseContext.router,
    route: routeInfo.route,
    action: phaseContext.transaction.action,
    jobId: phaseContext.job.id,
    signal: phaseContext.job.signal,
    ...(error !== undefined && { error }),
  };
}
