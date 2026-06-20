// Выполняет фазы navigation transaction.
// Не знает протокол prepare → commit → post — только «как» выполнить каждый блок.
//
// Processor вызывает:
//   runReentered(ctx)
//   runPrepare(ctx)
//   runPreCommit(ctx)
//   runCommit(ctx)
//   runPostCommit(ctx)

import type { MatchedRouteInfo } from './aura-routing-url-matcher';
import type { HistoryAction } from './aura-routing-history-navigator';
import type { TransitionMap } from './aura-routing-transition-map';
import type { AuraRoutingProcessorJob } from './aura-routing-processor-job';
import { AuraRoutingPhaseHandler } from './aura-routing-phase-handler';
import type { GuardResult } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavigationTransaction {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  plan: TransitionMap;
}

export interface PhaseContext {
  tx: NavigationTransaction;
  job: AuraRoutingProcessorJob;
  isJobActive: () => boolean;
}

export type TransactionResult =
  | { status: 'committed' }
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | { status: 'error'; error: unknown };

/** Non-null = navigation must stop (cancel / redirect / error). */
type PhaseOutcome = TransactionResult | null;

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export class PhaseExecutor {
  /**
   * Reentered: только `reentered` hooks + lifecycle.
   * Вызывается когда plan.reentered === true.
   */
  async runReentered(ctx: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of ctx.tx.plan.enterRoutes) {
      const { route } = routeInfo;
      if (!route.reentered) continue;

      try {
        const result = await AuraRoutingPhaseHandler.runPhase(
          'reentered',
          routeInfo,
          ctx.isJobActive,
        );
        route.onReentered(routeInfo);

        const redirect = this.applyRedirect(result);
        if (redirect) return redirect;
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    return null;
  }

  /**
   * PREPARE (pre-commit, blocking):
   *   deactivate: leave
   *   activate:   enter + load
   */
  async runPrepare(ctx: PhaseContext): Promise<PhaseOutcome> {
    const { plan } = ctx.tx;

    // ——— Exit guards (bubble: leaf → LCA) ———
    for (const routeInfo of plan.exitRoutes) {
      const { route } = routeInfo;

      if (!route.leave) continue;

      try {
        const blocked = await this.runBlockingPhase(
          () => AuraRoutingPhaseHandler.runPhase('leave', routeInfo, ctx.isJobActive),
        );
        if (blocked) return blocked;

        route.afterLeave(routeInfo);
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    // ——— Enter + load (capture: LCA → leaf) ———
    for (const routeInfo of plan.enterRoutes) {
      const { route } = routeInfo;

      if (route.enter) {
        route.onEnter(routeInfo);
        try {
          const outcome = await this.runBlockingPhase(
            () => AuraRoutingPhaseHandler.runPhase('enter', routeInfo, ctx.isJobActive),
          );
          if (outcome) return outcome;
        } catch (error) {
          return this.failWithError(routeInfo, error, ctx);
        }
      }

      if (route.load) {
        route.onLoad(routeInfo);
        try {
          const outcome = await this.runBlockingPhase(
            () => AuraRoutingPhaseHandler.runPhase('load', routeInfo, ctx.isJobActive),
          );
          if (outcome) return outcome;
        } catch (error) {
          return this.failWithError(routeInfo, error, ctx);
        }
      }
    }

    return null;
  }

  /**
   * PRE-COMMIT: entering (non-blocking hooks, blocking errors).
   */
  async runPreCommit(ctx: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of ctx.tx.plan.enterRoutes) {
      const { route } = routeInfo;
      if (!route.entering) continue;

      route.onEntering(routeInfo);

      try {
        await AuraRoutingPhaseHandler.runPhase('entering', routeInfo, ctx.isJobActive);
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    return null;
  }

  /**
   * COMMIT: render — точка невозврата.
   */
  async runCommit(ctx: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of ctx.tx.plan.enterRoutes) {
      try {
        const response = await AuraRoutingPhaseHandler.runRenderPhase(routeInfo, ctx.job);

        if (response === 'aborted' || !ctx.isJobActive()) {
          return { status: 'cancelled' };
        }
      } catch (error) {
        // В текущем processor — return undefined (баг: transition считается committed).
        // Здесь — явный error:
        //console.error(`render phase failed:`, error);
        //return undefined;
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    return null;
  }

  /**
   * POST-COMMIT (effects / cleanup, non-blocking):
   *   deactivate: leaving → left
   *   activate:   entered
   */
  async runPostCommit(ctx: PhaseContext): Promise<PhaseOutcome> {
    const { plan } = ctx.tx;

    for (const routeInfo of plan.exitRoutes) {
      const { route } = routeInfo;

      if (route.leaving) {
        await this.runPhaseSafe('leaving', routeInfo, ctx);
        route.onLeaving(routeInfo);
      }

      if (route.left) {
        await this.runPhaseSafe('left', routeInfo, ctx);
      }

      route.onLeft(routeInfo);
    }

    for (const routeInfo of plan.enterRoutes) {
      const { route } = routeInfo;
      if (!route.entered) continue;

      const result = await this.runPhaseSafe('entered', routeInfo, ctx);
      route.onEntered(routeInfo);

      const redirect = this.applyRedirect(result);
      if (redirect) return redirect;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Blocking guard: cancel или redirect. */
  private async runBlockingPhase(
    run: () => Promise<GuardResult>,
  ): Promise<TransactionResult | false> {
    const result = await run();
    if (result === false) return { status: 'cancelled' };
    return this.applyRedirect(result);
  }

  private applyRedirect(result: GuardResult): TransactionResult | false {
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

  private async failWithError(
    routeInfo: MatchedRouteInfo,
    error: unknown,
    ctx: PhaseContext,
  ): Promise<TransactionResult> {
    routeInfo.route.onError({ ...routeInfo, error });

    try {
      await AuraRoutingPhaseHandler.runPhase('error', routeInfo, ctx.isJobActive, { error });
    } catch (hookError) {
      console.error(hookError);
    }

    return { status: 'error', error };
  }

  /** Post-commit hooks: ошибки логируются, не отменяют transition. */
  private async runPhaseSafe(
    phase: string,
    routeInfo: MatchedRouteInfo,
    ctx: PhaseContext,
  ): Promise<GuardResult> {
    try {
      return await AuraRoutingPhaseHandler.runPhase(phase, routeInfo, ctx.isJobActive);
    } catch (error) {
      console.error(`[${phase}] hook failed after commit:`, error);
      return undefined;
    }
  }
}