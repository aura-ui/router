import type { MatchedRouteInfo } from '../match/url-matcher';
import type { HistoryAction } from '../history';
import type { TransitionMap } from '../transition/plan';
import type { AuraRoutingProcessorJob } from './job';
import { runPhaseHooks, type HookRegistry } from '../hooks/registry';
import { resolveHookNames } from '../hooks/phases';
import { isRenderError, runViewCommit } from './view-commit';
import type { GuardResult } from '../guard.types';
import type { RoutePhase } from '../hooks/types';
import type { RouteInfo, RouteLifecycleContext, RouterInstance } from '../hooks/types';
import type { TransitionPolicy } from '../transition/policy';
import type { NavigationErrorPhase, ReportNavigationHookError } from './navigation-error.types';
import { CommitTracker } from './commit-tracker';
import { FailedNavigation } from './failed-navigation';
import { normalizeFailure } from './navigation-error';
import { LIFECYCLE_STEPS, type LifecycleStepDef } from './lifecycle-step';
import { guardResultToPhaseOutcome, runPhaseStep, type PhaseStepOutcome } from './phase-runner';

/** Arguments for {@link AuraRoutingProcessor.run} (plan and policy are added by the processor). */
export interface ProcessorRunInput {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  router: RouterInstance;
  reportHookError?: ReportNavigationHookError;
}

/** Enriched navigation run: {@link ProcessorRunInput} + transition plan and order. */
export interface NavigationTransaction extends ProcessorRunInput {
  plan: TransitionMap;
  /** `null` — skip transitionOut/transitionIn (inactive transition package). */
  transitionOrder: TransitionPolicy | null;
}

export type { CommitSnapshot } from './commit-snapshot';

/** Shared ctx for all {@link ProcessorPipeline} steps. */
export interface PipelineContext {
  transaction: NavigationTransaction;
  job: AuraRoutingProcessorJob;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  commitTracker: CommitTracker;
  reportHookError?: ReportNavigationHookError;
  /** False when the navigation job was superseded or the router was torn down. */
  isJobActive: () => boolean;
}

/**
 * Terminal processor outcome returned to {@link AuraRoutingProcessor}.
 *
 * `status: 'viewCommitted'` — full pipeline succeeded (not the same as
 * {@link CommitSnapshot.view} `committed` or {@link FailedNavigation.viewCommitted}).
 * History URL commit is done by {@link AuraRoutingEngine} after success.
 */
export type TransactionResult =
  | { status: 'viewCommitted' }
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | { status: 'error'; failure: FailedNavigation };

/** Pipeline step result: terminal {@link TransactionResult}, or `null` to continue. */
type PipelineOutcome = TransactionResult | null;

/** Async sub-step; returns terminal outcome or `null` to continue the sequence. */
type PipelineStep = (pipelineContext: PipelineContext) => Promise<PipelineOutcome>;

/**
 * Navigation transaction pipeline inside {@link AuraRoutingProcessor}.
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
   * @param pipelineContext - transaction, job, hook runner, and stale-job guard
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
   * View commit for each activate-branch route.
   * On render error runs exit cleanup (`left`) before returning `{ status: 'error' }`.
   */
  private async runRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    for (const matchedRoute of pipelineContext.transaction.plan.enterRoutes) {
      const viewCommit = await runViewCommit(matchedRoute, pipelineContext.job);

      if (viewCommit === 'aborted' || !pipelineContext.isJobActive()) {
        return { status: 'cancelled' };
      }

      if (isRenderError(viewCommit)) {
        await this.runExitCleanup(pipelineContext);
        pipelineContext.commitTracker.markViewCommittedAfterErrorRecovery();
        return this.failWithError(matchedRoute, viewCommit.error, pipelineContext, 'render');
      }

      pipelineContext.commitTracker.markViewStaged();
    }

    return null;
  }

  /** Commits staged incoming views on the enter branch after transition hooks, before exit `left`. */
  private commitEnterViews(pipelineContext: PipelineContext): void {
    for (const matchedRoute of pipelineContext.transaction.plan.enterRoutes) {
      matchedRoute.route.commitStagedView?.();
    }
    pipelineContext.commitTracker.markViewCommitted();
  }

  /** `left` on exit branch after view commit or render error. */
  private async runExitCleanup(pipelineContext: PipelineContext): Promise<void> {
    await this.runLifecycleStep(LIFECYCLE_STEPS.left, pipelineContext);
  }

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

  /** Runs one {@link LifecycleStepDef} over `exitRoutes` or `enterRoutes`. */
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

  /** One route: lifecycle callback, then blocking or post-commit registered hooks. */
  private async runLifecycleStepForRoute(
    step: LifecycleStepDef,
    matchedRoute: MatchedRouteInfo,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const { route } = matchedRoute;
    const lifecycleContext = toLifecycleContext(step.lifecyclePhase, matchedRoute, pipelineContext);
    const hookNames = resolveHookNames(route, step.lifecyclePhase);

    return runPhaseStep({
      lifecyclePhase: step.lifecyclePhase,
      onThrow: step.onThrow,
      hookKind: step.hooks.kind,
      hookErrors: step.hooks.kind === 'postCommit' ? step.hooks.hookErrors : undefined,
      invokeRoute: () => step.onRoute(route, lifecycleContext),
      hookNames,
      handlers: {
        runBlockingHooks: (names) =>
          this.runBlockingHooks(lifecycleContext, pipelineContext, names),
        runPostCommitHooks: (names, hookErrors, phase) =>
          this.runPostCommitHooksStep(
            lifecycleContext,
            pipelineContext,
            names,
            hookErrors,
            phase,
          ),
        failWithError: (error) =>
          this.failWithError(matchedRoute, error, pipelineContext, step.lifecyclePhase),
      },
    });
  }

  private async runPostCommitHooksStep(
    lifecycleContext: RouteLifecycleContext,
    pipelineContext: PipelineContext,
    hookNames: readonly string[],
    hookErrors: 'propagate' | 'log',
    lifecyclePhase: RoutePhase,
  ): Promise<PhaseStepOutcome> {
    const hookResult =
      hookErrors === 'log'
        ? await this.runPostCommitHooks(lifecycleContext, pipelineContext, hookNames)
        : await runPhaseHooks(
            pipelineContext.hookRegistry,
            lifecycleContext,
            hookNames,
            pipelineContext.isJobActive,
          );

    this.warnIgnoredTerminalResult(lifecyclePhase, hookResult);
    return null;
  }

  /** Blocking hooks: `false` cancels, redirect URL stops navigation. */
  private async runBlockingHooks(
    lifecycleContext: RouteLifecycleContext,
    pipelineContext: PipelineContext,
    hookNames: readonly string[],
  ): Promise<PhaseStepOutcome> {
    const hookResult = await runPhaseHooks(
      pipelineContext.hookRegistry,
      lifecycleContext,
      hookNames,
      pipelineContext.isJobActive,
    );

    return guardResultToPhaseOutcome(hookResult);
  }

  /** Logs cancel/redirect from post-commit hooks; navigation already committed. */
  private warnIgnoredTerminalResult(lifecyclePhase: RoutePhase, hookResult: GuardResult): void {
    if (hookResult === false) {
      console.warn(`[${lifecyclePhase}] hook returned false after view commit — ignored`);
      return;
    }

    const redirect = guardResultToPhaseOutcome(hookResult);
    if (redirect?.status === 'redirect') {
      console.warn(
        `[${lifecyclePhase}] hook returned redirect after view commit — ignored: ${redirect.url}`,
      );
      return;
    }
  }

  /** Invokes `route.onError` and `error` hooks; returns `{ status: 'error' }`. */
  private async failWithError(
    matchedRoute: MatchedRouteInfo,
    error: unknown,
    pipelineContext: PipelineContext,
    errorPhase: NavigationErrorPhase,
  ): Promise<Extract<TransactionResult, { status: 'error' }>> {
    const normalized = normalizeFailure(error, {
      phase: errorPhase,
      routePattern: matchedRoute.pattern,
    });
    const errorContext = toLifecycleContext('error', matchedRoute, pipelineContext, normalized);
    matchedRoute.route.onError({ ...errorContext, error: normalized });

    const { transaction, commitTracker } = pipelineContext;
    const failed = FailedNavigation.fromPipeline(
      normalized,
      commitTracker.snapshot,
      transaction.from,
      transaction.to,
      transaction.action,
    );

    const errorHooks = resolveHookNames(matchedRoute.route, 'error');
    if (errorHooks?.length) {
      try {
        await runPhaseHooks(
          pipelineContext.hookRegistry,
          errorContext,
          errorHooks,
          pipelineContext.isJobActive,
        );
      } catch (hookError) {
        pipelineContext.reportHookError?.(hookError, failed);
      }
    }

    return failed.toResult();
  }

  /** Post-commit hooks with `hookErrors: 'log'`; errors are logged, not propagated. */
  private async runPostCommitHooks(
    lifecycleContext: RouteLifecycleContext,
    pipelineContext: PipelineContext,
    hookNames: readonly string[],
  ): Promise<GuardResult> {
    try {
      return await runPhaseHooks(
        pipelineContext.hookRegistry,
        lifecycleContext,
        hookNames,
        pipelineContext.isJobActive,
      );
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

export type { HookRegistry } from '../hooks/registry';
export type { ViewCommitResult } from './view-commit';
