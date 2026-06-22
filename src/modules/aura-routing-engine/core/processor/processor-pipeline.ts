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

/** Input for a single navigation run: matched routes, history action, and transition plan. */
export interface NavigationTransaction {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  plan: TransitionMap;
  transitionPolicy: TransitionPolicy;
}

/** Shared ctx for all {@link ProcessorPipeline} steps (transaction, job, router). */
export interface PipelineContext {
  transaction: NavigationTransaction;
  job: AuraRoutingProcessorJob;
  router: RouterInstance;
  isJobActive: () => boolean;
}

/** Terminal processor outcome returned to {@link AuraRoutingProcessor}. */
export type TransactionResult =
  | { status: 'committed' }
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | { status: 'error'; error: unknown; phase: NavigationErrorPhase; committed: boolean };

/** Pipeline step result: terminal {@link TransactionResult}, or `null` to continue. */
type PipelineOutcome = TransactionResult | null;

type PipelineStep = (pipelineContext: PipelineContext) => Promise<PipelineOutcome>;

type RedirectResult = Extract<TransactionResult, { status: 'redirect' }>;

/**
 * Navigation transaction pipeline inside {@link AuraRoutingProcessor}.
 *
 * Orchestrates route lifecycle phases from guards through view commit to post-render cleanup.
 * View commit (`runRender`) is not a lifecycle hook; history commit happens after the processor succeeds.
 *
 * ## Main flow
 *
 * ```mermaid
 * flowchart TD
 *   START([run]) --> REENTER{plan.reenter?}
 *   REENTER -->|yes| RENTER[runReenter]
 *   RENTER --> DONE([committed / terminal])
 *   REENTER -->|no| GUARDS[runGuards]
 *   GUARDS --> LOADS[runLoads]
 *   LOADS --> RENDER_TX[runRenderWithTransition]
 *   RENDER_TX --> AFTER[runAfterRender]
 *   AFTER --> DONE
 *
 *   GUARDS --> LEAVE[leave · exitRoutes]
 *   LEAVE --> ENTER[enter · enterRoutes]
 *
 *   RENDER_TX --> POLICY{transitionPolicy}
 *   POLICY -->|out-in| OUTIN["transitionOut → render → transitionIn"]
 *   POLICY -->|in-out| INOUT["render → transitionIn → transitionOut"]
 *   POLICY -->|parallel| PAR["render → transitionOut ‖ transitionIn"]
 *
 *   AFTER --> LEFT[left · exitRoutes]
 *   LEFT --> ENTERED[entered · enterRoutes]
 * ```
 *
 * Terminal outcomes (`cancelled`, `redirect`, `error`) short-circuit the pipeline at the step that produced them.
 * Blocking hooks (`leave`, `enter`, `load`) may cancel or redirect before view commit.
 * Post-commit hooks (`transitionOut`, `transitionIn`, `left`, `entered`) log cancel/redirect and continue.
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
   * @param pipelineContext - transaction, job, and stale-job guard (built by {@link AuraRoutingProcessor})
   */
  async run(pipelineContext: PipelineContext): Promise<TransactionResult> {
    const { transaction } = pipelineContext;

    if (transaction.plan.reenter) {
      const reenterOutcome = await this.runReenter(pipelineContext);
      return reenterOutcome ?? { status: 'committed' };
    }

    const outcome = await this.runUntilTerminal(this.steps, pipelineContext);
    return outcome ?? { status: 'committed' };
  }

  /** Shortcut path when only query/params change on the same route (`reenter`). */
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
   * View commit plus `transition-out` / `transition-in` ordered by {@link TransitionPolicy}.
   *
   * out-in: transition-out → render → transition-in
   * in-out: render → transition-in → transition-out
   * parallel: render → transition-out ‖ transition-in
   */
  async runRenderWithTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    const { transitionPolicy } = pipelineContext.transaction;

    if (transitionPolicy === 'parallel') {
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

    return this.runUntilTerminal(sequentialSteps[transitionPolicy], pipelineContext);
  }

  /** parallel: render → transition-out ‖ transition-in */
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

  /** Post-commit effects on activate branch: `entered` (after `left` cleanup on exit branch). */
  async runAfterRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    await this.runExitCleanup(pipelineContext);
    return this.runLifecycleStep(LIFECYCLE_STEPS.entered, pipelineContext);
  }

  private async runExitTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(LIFECYCLE_STEPS.transitionOut, pipelineContext);
  }

  private async runEnterTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(LIFECYCLE_STEPS.transitionIn, pipelineContext);
  }

  /** View commit: {@link RouteHookRunner.runViewCommit} for each activate-branch route. */
  private async runRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    for (const matchedRoute of pipelineContext.transaction.plan.enterRoutes) {
      try {
        const viewCommit = await RouteHookRunner.runViewCommit(matchedRoute, pipelineContext.job);

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

  /** `left` lifecycle on deactivate branch after view commit or render error. */
  private async runExitCleanup(pipelineContext: PipelineContext): Promise<void> {
    await this.runLifecycleStep(LIFECYCLE_STEPS.left, pipelineContext);
  }

  /**
   * Runs steps in order; stops at the first terminal {@link PipelineOutcome}.
   * @param steps - sub-steps within a pipeline or transition-policy sequence
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
   * Runs a {@link LifecycleStepDef} over the plan branch (exit or enter routes).
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

  /** Runs lifecycle callback and hooks for a single route on the step's branch. */
  private async runLifecycleStepForRoute(
    step: LifecycleStepDef,
    matchedRoute: MatchedRouteInfo,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const { route } = matchedRoute;
    const lifecycleContext = toLifecycleContext(step.lifecyclePhase, matchedRoute, pipelineContext);

    try {
      step.onRoute(route, lifecycleContext);

      const hookNames = route[step.lifecyclePhase];
      if (!hookNames?.length) return null;

      return step.hooks.kind === 'blocking'
        ? this.runBlockingHooks(lifecycleContext, pipelineContext)
        : this.runPostCommitHooksWithWarnings(step, lifecycleContext, pipelineContext);
    } catch (error) {
      if (!step.failOnLifecycleError) throw error;
      return this.failWithError(matchedRoute, error, pipelineContext, step.lifecyclePhase);
    }
  }

  /** Blocking hooks: cancel/redirect ends the transaction; otherwise continue to the next route. */
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

  /** Post-commit hooks: terminal results are logged and ignored. */
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

  /** Extracts redirect from {@link GuardResult}; returns `false` when navigation should continue. */
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

  /** After view commit: cancel/redirect from hooks are logged and ignored (NAVIGATION_TRANSACTION_MODEL). */
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

  private async failWithError(
    matchedRoute: MatchedRouteInfo,
    error: unknown,
    pipelineContext: PipelineContext,
    failedAt: NavigationErrorPhase,
  ): Promise<Extract<TransactionResult, { status: 'error' }>> {
    const errorContext = toLifecycleContext('error', matchedRoute, pipelineContext, error);
    matchedRoute.route.onError({ ...errorContext, error });

    if (matchedRoute.route.error?.length) {
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
      committed: failedAt === 'render',
    };
  }

  /** Runs post-commit hooks; hook errors are logged and do not fail the transaction. */
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

/** Returns the first terminal pipeline outcome, or `null` when all are non-terminal. */
function firstTerminalOutcome(...outcomes: PipelineOutcome[]): PipelineOutcome {
  for (const outcome of outcomes) {
    if (outcome) return outcome;
  }

  return null;
}

/** {@link RouteInfo} slice for hook ctx (`to` / `from`). */
function toRouteInfo(matchedRoute: MatchedRouteInfo): RouteInfo {
  return {
    path: matchedRoute.pathname,
    ...(matchedRoute.params && { params: matchedRoute.params }),
    ...(matchedRoute.query && { query: matchedRoute.query }),
  };
}

/**
 * Builds {@link RouteLifecycleContext} for a route on the current branch.
 * @param lifecyclePhase - `ctx.phase` passed to hooks (`leave`, `enter`, `load`, …)
 * @param matchedRoute - route instance on the exit or enter branch
 * @param pipelineContext - active navigation run
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
