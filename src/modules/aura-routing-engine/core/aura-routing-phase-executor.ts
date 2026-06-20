// Выполняет фазы navigation transaction.
//
// Processor вызывает:
//   runReentered(ctx)
//   runGuards(ctx)
//   runLoads(ctx)
//   runPreCommit(ctx)
//   runCommit(ctx)
//   runPostCommit(ctx)
//
// Lifecycle (onEnter, onLoad, …) — всегда; hooks — только при непустом attr на route.

import type { MatchedRouteInfo } from './aura-routing-url-matcher';
import type { HistoryAction } from './aura-routing-history-navigator';
import type { TransitionMap } from './aura-routing-transition-map';
import type { AuraRoutingProcessorJob } from './aura-routing-processor-job';
import { AuraRoutingPhaseHandler } from './aura-routing-phase-handler';
import type { GuardResult } from './types';
import type { RoutePhase } from '../../aura-route-hooks/core';

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
  async runReentered(ctx: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of ctx.tx.plan.enterRoutes) {
      const { route } = routeInfo;

      try {
        route.onReentered(routeInfo);

        if (route.reentered?.length) {
          const result = await AuraRoutingPhaseHandler.runPhase(
            'reentered',
            routeInfo,
            ctx.isJobActive,
          );
          const redirect = this.applyRedirect(result);
          if (redirect) return redirect;
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    return null;
  }

  /**
   * Guards (pre-commit, blocking):
   *   deactivate: leave
   *   activate:   enter
   */
  async runGuards(ctx: PhaseContext): Promise<PhaseOutcome> {
    const { plan } = ctx.tx;

    for (const routeInfo of plan.exitRoutes) {
      const { route } = routeInfo;

      try {
        route.onLeave(routeInfo);
        if (route.leave?.length) {
          const blocked = await this.runBlockingPhase(
            () => AuraRoutingPhaseHandler.runPhase('leave', routeInfo, ctx.isJobActive),
          );
          if (blocked) return blocked;
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    for (const routeInfo of plan.enterRoutes) {
      const { route } = routeInfo;

      try {
        route.onEnter(routeInfo);
        if (route.enter?.length) {
          const outcome = await this.runBlockingPhase(
            () => AuraRoutingPhaseHandler.runPhase('enter', routeInfo, ctx.isJobActive),
          );
          if (outcome) return outcome;
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    return null;
  }

  /**
   * Loads (pre-commit, blocking): activate branch — load.
   */
  async runLoads(ctx: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of ctx.tx.plan.enterRoutes) {
      const { route } = routeInfo;

      try {
        route.onLoad(routeInfo);
        if (route.load?.length) {
          const outcome = await this.runBlockingPhase(
            () => AuraRoutingPhaseHandler.runPhase('load', routeInfo, ctx.isJobActive),
          );
          if (outcome) return outcome;
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    return null;
  }

  async runPreCommit(ctx: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of ctx.tx.plan.enterRoutes) {
      const { route } = routeInfo;

      try {
        route.onEntering(routeInfo);

        if (route.entering?.length) {
          await AuraRoutingPhaseHandler.runPhase('entering', routeInfo, ctx.isJobActive);
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    return null;
  }

  async runCommit(ctx: PhaseContext): Promise<PhaseOutcome> {
    for (const routeInfo of ctx.tx.plan.enterRoutes) {
      try {
        const response = await AuraRoutingPhaseHandler.runRenderPhase(routeInfo, ctx.job);

        if (response === 'aborted' || !ctx.isJobActive()) {
          return { status: 'cancelled' };
        }
      } catch (error) {
        return this.failWithError(routeInfo, error, ctx);
      }
    }

    return null;
  }

  async runPostCommit(ctx: PhaseContext): Promise<PhaseOutcome> {
    const { plan } = ctx.tx;

    for (const routeInfo of plan.exitRoutes) {
      const { route } = routeInfo;

      route.onLeaving(routeInfo);
      if (route.leaving?.length) {
        await this.runPhaseSafe('leaving', routeInfo, ctx);
      }

      route.onLeft(routeInfo);
      if (route.left?.length) {
        await this.runPhaseSafe('left', routeInfo, ctx);
      }
    }

    for (const routeInfo of plan.enterRoutes) {
      const { route } = routeInfo;

      route.onEntered(routeInfo);

      if (route.entered?.length) {
        const result = await this.runPhaseSafe('entered', routeInfo, ctx);
        const redirect = this.applyRedirect(result);
        if (redirect) return redirect;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

    if (routeInfo.route.error?.length) {
      try {
        await AuraRoutingPhaseHandler.runPhase('error', routeInfo, ctx.isJobActive, { error });
      } catch (hookError) {
        console.error(hookError);
      }
    }

    return { status: 'error', error };
  }

  private async runPhaseSafe(
    phase: RoutePhase,
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
