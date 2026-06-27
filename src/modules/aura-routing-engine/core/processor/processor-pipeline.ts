import type { MatchedRouteInfo } from '../match/url-matcher';
import type { HistoryAction } from '../history';
import type { TransitionMap } from '../transition/plan';
import type { AuraRoutingProcessorJob } from './job';
import { RouteHookRunner } from './route-hook-runner';
import type { GuardResult } from '../guard.types';
import type { RoutePhase, RouteInfo, RouteLifecycleContext, RouterInstance } from '../../../aura-route-hooks/core';
import type { TransitionPolicy } from '../transition/policy';
import type { NavigationErrorPhase } from './navigation-error.types';
import {
  LIFECYCLE_STEPS,
  type LifecycleStepDef,
} from './lifecycle-step';
import { routeHookNames } from '../../../aura-route-hooks/core/phase-hooks';

/** Arguments for {@link AuraRoutingProcessor.run} (plan and policy are added by the processor). */
export interface ProcessorRunInput {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  router: RouterInstance;
}

/** Enriched navigation run: {@link ProcessorRunInput} + transition plan and order. */
export interface NavigationTransaction extends ProcessorRunInput {
  plan: TransitionMap;
  /** `null` — skip transitionOut/transitionIn (inactive transition package). */
  transitionOrder: TransitionPolicy | null;
}

/** Shared ctx for all {@link ProcessorPipeline} steps. */
export interface PipelineContext {
  transaction: NavigationTransaction;
  job: AuraRoutingProcessorJob;
  router: RouterInstance;
  /** False when the navigation job was superseded or the router was torn down. */
  isJobActive: () => boolean;
}

/**
 * Terminal processor outcome returned to {@link AuraRoutingProcessor}.
 *
 * `viewCommitted` means view/render succeeded — history URL commit is done by {@link AuraRoutingEngine} after this.
 */
export type TransactionResult =
  | { status: 'viewCommitted' }
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | { status: 'error'; error: unknown; phase: NavigationErrorPhase; viewCommitted: boolean };

/** Pipeline step result: terminal {@link TransactionResult}, or `null` to continue. */
type PipelineOutcome = TransactionResult | null;

/** Async sub-step; returns terminal outcome or `null` to continue the sequence. */
type PipelineStep = (pipelineContext: PipelineContext) => Promise<PipelineOutcome>;

/** Redirect branch of {@link TransactionResult}. */
type RedirectResult = Extract<TransactionResult, { status: 'redirect' }>;

/**
 * Navigation transaction pipeline inside {@link AuraRoutingProcessor}.
 *
 * ```mermaid
 * flowchart TD
 *   START([run]) --> REENTER{plan.reenter?}
 *   REENTER -->|yes| RENTER[runReenter]
 *   RENTER --> DONE([viewCommitted / terminal])
 *   REENTER -->|no| GUARDS[runGuards]
 *   GUARDS --> LOADS[runLoads]
 *   LOADS --> RENDER_TX[runRenderWithTransition]
 *   RENDER_TX --> AFTER[runAfterRender]
 *   AFTER --> DONE
 *
 *   GUARDS --> LEAVE[leave · exitRoutes]
 *   LEAVE --> ENTER[enter · enterRoutes]
 *
   *   RENDER_TX --> POLICY{transitionOrder}
 *   POLICY -->|out-in| OUTIN["transitionOut → render → transitionIn"]
 *   POLICY -->|in-out| INOUT["render → transitionIn → transitionOut"]
 *   POLICY -->|parallel| PAR["render → transitionOut ‖ transitionIn"]
 *
 *   AFTER --> LEFT[left · exitRoutes]
 *   LEFT --> AFTER_HOOKS[after · enterRoutes]
 * ```
 *
 * View commit (`runRender`) is not a lifecycle hook; URL commit happens after the processor succeeds.
 * Blocking hooks (`leave`, `enter`, `load`) may cancel or redirect before view commit.
 * Post-commit hooks log cancel/redirect and continue.
 */
export class ProcessorPipeline {
  private readonly steps: PipelineStep[] = [
    (ctx) => this.runGuards(ctx),
    (ctx) => this.runLoads(ctx),
    (ctx) => this.runRenderWithTransition(ctx),
    (ctx) => this.runAfterRender(ctx),
  ];

  /**
   * Runs the full navigation transaction pipeline.
   * @param pipelineContext - transaction, job, and stale-job guard from {@link AuraRoutingProcessor}
   */
  async run(pipelineContext: PipelineContext): Promise<TransactionResult> {
    const { transaction } = pipelineContext;

    if (transaction.plan.reenter) {
      const reenterOutcome = await this.runReenter(pipelineContext);
      return reenterOutcome ?? { status: 'viewCommitted' };
    }

    const outcome = await this.runUntilTerminal(this.steps, pipelineContext);
    return outcome ?? { status: 'viewCommitted' };
  }

  /** Reenter shortcut when only query/params change on the same route (no `after` — same view). */
  async runReenter(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(LIFECYCLE_STEPS.reenter, pipelineContext);
  }

  /** Pre-commit guards: `leave` on exit branch, then `enter` on activate branch. */
  async runGuards(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runUntilTerminal(
      [
        (ctx) => this.runLifecycleStep(LIFECYCLE_STEPS.leave, ctx),
        (ctx) => this.runLifecycleStep(LIFECYCLE_STEPS.enter, ctx),
      ],
      pipelineContext,
    );
  }

  /** Pre-commit data loading: `load` on activate branch. */
  async runLoads(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(LIFECYCLE_STEPS.load, pipelineContext);
  }

  /**
   * View commit plus transitions ordered by {@link TransitionPolicy}.
   *
   * out-in: transitionOut → render → transitionIn
   * in-out: render → transitionIn → transitionOut
   * parallel: render → transitionOut ‖ transitionIn
   */
  async runRenderWithTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    const { transitionOrder } = pipelineContext.transaction;

    if (transitionOrder === null) {
      return this.runRender(pipelineContext);
    }

    if (transitionOrder === 'parallel') {
      return this.runParallelRenderWithTransition(pipelineContext);
    }

    const sequentialSteps: Record<Exclude<TransitionPolicy, 'parallel'>, PipelineStep[]> = {
      'out-in': [
        (ctx) => this.runExitTransition(ctx),
        (ctx) => this.runRender(ctx),
        (ctx) => this.runEnterTransition(ctx),
      ],
      'in-out': [
        (ctx) => this.runRender(ctx),
        (ctx) => this.runEnterTransition(ctx),
        (ctx) => this.runExitTransition(ctx),
      ],
    };

    return this.runUntilTerminal(sequentialSteps[transitionOrder], pipelineContext);
  }

  /** Parallel policy: render, then transitionOut and transitionIn concurrently. */
  private async runParallelRenderWithTransition(
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const viewCommitOutcome = await this.runRender(pipelineContext);
    if (viewCommitOutcome) return viewCommitOutcome;

    const [exitTransitionOutcome, enterTransitionOutcome] = await Promise.all([
      this.runExitTransition(pipelineContext),
      this.runEnterTransition(pipelineContext),
    ]);

    return firstTerminalOutcome(exitTransitionOutcome, enterTransitionOutcome);
  }

  /** Post-commit: {@link commitEnterViews}, `left`, then `after`. */
  async runAfterRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    this.commitEnterViews(pipelineContext);
    await this.runExitCleanup(pipelineContext);
    return this.runLifecycleStep(LIFECYCLE_STEPS.after, pipelineContext);
  }

  /** `transitionOut` on exit branch. */
  private async runExitTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(LIFECYCLE_STEPS.transitionOut, pipelineContext);
  }

  /** `transitionIn` on activate branch. */
  private async runEnterTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(LIFECYCLE_STEPS.transitionIn, pipelineContext);
  }

  /**
   * View commit via {@link RouteHookRunner.runViewCommit} for each activate-branch route.
   * On render error runs exit cleanup (`left`) before returning `{ status: 'error' }`.
   */
  private async runRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    for (const matchedRoute of pipelineContext.transaction.plan.enterRoutes) {
      try {
        const viewCommit = await RouteHookRunner.runViewCommit(
          matchedRoute,
          pipelineContext.job,
        );

        if (viewCommit === 'aborted' || !pipelineContext.isJobActive()) {
          return { status: 'cancelled' };
        }
      } catch (error) {
        await this.runExitCleanup(pipelineContext);
        return this.failWithError(matchedRoute, error, pipelineContext, 'render');
      }
    }

    return null;
  }

  /**
   * Commits staged incoming views on the **enter** branch after `transitionIn` / `transitionOut`.
   *
   * Active transition package mounts the new route with outlet `stage` — two view roots may
   * coexist until this step. Each enter route's {@link RouteInstance.commitStagedView} promotes
   * its staged root via `outlet.commitStage`, drops the outgoing DOM sibling, and resets the
   * route view controller from `stage` back to `replace`.
   *
   * No-op when render used `replace` (no staged mount). Must run on **enter** routes: exit
   * `onLeft` owns a different {@link RouteInstance} and cannot commit the incoming view.
   *
   * Order: after transition hooks, **before** exit `left` — DOM swap is settled before exit cleanup.
   *
   * @param pipelineContext - active navigation run; iterates `transaction.plan.enterRoutes`
   */
  private commitEnterViews(pipelineContext: PipelineContext): void {
    for (const matchedRoute of pipelineContext.transaction.plan.enterRoutes) {
      matchedRoute.route.commitStagedView?.();
    }
  }

  /** `left` on exit branch after view commit or render error. */
  private async runExitCleanup(pipelineContext: PipelineContext): Promise<void> {
    await this.runLifecycleStep(LIFECYCLE_STEPS.left, pipelineContext);
  }

  /**
   * Runs sub-steps in order; stops at the first terminal outcome.
   * @param steps - guards sequence, transition-policy sequence, etc.
   */
  private async runUntilTerminal(
    steps: PipelineStep[],
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    for (const step of steps) {
      const outcome = await step(pipelineContext);
      if (outcome) return outcome;
    }

    return null;
  }

  /**
   * Runs one {@link LifecycleStepDef} over `exitRoutes` or `enterRoutes`.
   * @param step - row from {@link LIFECYCLE_STEPS}
   */
  private async runLifecycleStep(
    step: LifecycleStepDef,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const matchedRoutes = pipelineContext.transaction.plan[step.branch];

    for (const matchedRoute of matchedRoutes) {
      const outcome = await this.runLifecycleStepForRoute(step, matchedRoute, pipelineContext);
      if (outcome) return outcome;
    }

    return null;
  }

  /** One route: lifecycle callback, then blocking or post-commit hooks. */
  private async runLifecycleStepForRoute(
    step: LifecycleStepDef,
    matchedRoute: MatchedRouteInfo,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const { route } = matchedRoute;
    const lifecycleContext = toLifecycleContext(step.lifecyclePhase, matchedRoute, pipelineContext);

    try {
      step.onRoute(route, lifecycleContext);

      const hookNames = routeHookNames(route, step.lifecyclePhase);
      if (!hookNames?.length) return null;

      return step.hooks.kind === 'blocking'
        ? this.runBlockingHooks(lifecycleContext, pipelineContext)
        : this.runPostCommitHooksWithWarnings(step, lifecycleContext, pipelineContext);
    } catch (error) {
      if (!step.failOnLifecycleError) throw error;
      return this.failWithError(matchedRoute, error, pipelineContext, step.lifecyclePhase);
    }
  }

  /**
   * Blocking hooks (`leave`, `enter`, `load`): `false` cancels, redirect URL stops navigation.
   * {@link RouteHookRunner.runLifecycleHooks} on stale job also yields cancel.
   */
  private async runBlockingHooks(
    lifecycleContext: RouteLifecycleContext,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const hookResult = await RouteHookRunner.runLifecycleHooks(
      lifecycleContext,
      pipelineContext.isJobActive,
    );

    if (hookResult === false) return { status: 'cancelled' };

    const redirect = this.toRedirectResult(hookResult);
    return redirect || null;
  }

  /**
   * Post-commit hooks: runs hooks and logs ignored cancel/redirect.
   * Steps with `hookErrors: 'log'` swallow hook throws.
   */
  private async runPostCommitHooksWithWarnings(
    step: LifecycleStepDef,
    lifecycleContext: RouteLifecycleContext,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const hookResult =
      step.hooks.kind === 'postCommit' && step.hooks.hookErrors === 'log'
        ? await this.runPostCommitHooks(lifecycleContext, pipelineContext)
        : await RouteHookRunner.runLifecycleHooks(lifecycleContext, pipelineContext.isJobActive);

    this.warnIgnoredTerminalResult(step.lifecyclePhase, hookResult);
    return null;
  }

  /** Maps {@link GuardResult} to redirect outcome; `false` means continue. */
  private toRedirectResult(hookResult: GuardResult): RedirectResult | false {
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

    return false;
  }

  /** Logs cancel/redirect from post-commit hooks; navigation already committed. */
  private warnIgnoredTerminalResult(lifecyclePhase: RoutePhase, hookResult: GuardResult): void {
    if (hookResult === false) {
      console.warn(`[${lifecyclePhase}] hook returned false after view commit — ignored`);
      return;
    }

    const redirect = this.toRedirectResult(hookResult);
    if (redirect) {
      console.warn(`[${lifecyclePhase}] hook returned redirect after view commit — ignored: ${redirect.url}`);
    }
  }

  /**
   * Invokes `route.onError` and `error` hooks; returns `{ status: 'error' }`.
   * `viewCommitted` is true when failure happened during view commit.
   */
  private async failWithError(
    matchedRoute: MatchedRouteInfo,
    error: unknown,
    pipelineContext: PipelineContext,
    failedAt: NavigationErrorPhase,
  ): Promise<Extract<TransactionResult, { status: 'error' }>> {
    const errorContext = toLifecycleContext('error', matchedRoute, pipelineContext, error);
    matchedRoute.route.onError({ ...errorContext, error });

    if (routeHookNames(matchedRoute.route, 'error')?.length) {
      try {
        await RouteHookRunner.runLifecycleHooks(errorContext, pipelineContext.isJobActive);
      } catch (hookError) {
        console.error(hookError);
      }
    }

    return {
      status: 'error',
      error,
      phase: failedAt,
      viewCommitted: failedAt === 'render',
    };
  }

  /** Post-commit hooks with `hookErrors: 'log'`; errors are logged, not propagated. */
  private async runPostCommitHooks(
    lifecycleContext: RouteLifecycleContext,
    pipelineContext: PipelineContext,
  ): Promise<GuardResult> {
    try {
      return await RouteHookRunner.runLifecycleHooks(lifecycleContext, pipelineContext.isJobActive);
    } catch (error) {
      console.error(`[${lifecycleContext.phase}] hook failed after view commit:`, error);
      return undefined;
    }
  }
}

/** First non-null terminal outcome among parallel sub-step results. */
function firstTerminalOutcome(...outcomes: PipelineOutcome[]): PipelineOutcome {
  for (const outcome of outcomes) {
    if (outcome) return outcome;
  }

  return null;
}

/** {@link RouteInfo} slice for hook ctx (`to` / `from`). */
function toRouteInfo(matchedRoute: MatchedRouteInfo): RouteInfo {
  return {
    pathname: matchedRoute.pathname,
    ...(matchedRoute.params && { params: matchedRoute.params }),
    ...(matchedRoute.query && { query: matchedRoute.query }),
  };
}

/**
 * Builds {@link RouteLifecycleContext} for a route on the current branch.
 * @param lifecyclePhase - `ctx.phase` for hooks (`leave`, `enter`, `load`, …)
 * @param matchedRoute - matched route on exit or enter branch
 * @param pipelineContext - active navigation run
 * @param error - set for `error` phase callbacks
 */
export function toLifecycleContext(
  lifecyclePhase: RoutePhase,
  matchedRoute: MatchedRouteInfo,
  pipelineContext: PipelineContext,
  error?: unknown,
): RouteLifecycleContext {
  return {
    phase: lifecyclePhase,
    from: pipelineContext.transaction.from ? toRouteInfo(pipelineContext.transaction.from) : null,
    to: toRouteInfo(matchedRoute),
    router: pipelineContext.router,
    route: matchedRoute.route,
    action: pipelineContext.transaction.action,
    jobId: pipelineContext.job.id,
    signal: pipelineContext.job.signal,
    ...(error !== undefined && { error }),
  };
}
