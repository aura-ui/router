import type { MatchedRouteInfo } from '../match/url-matcher';
import type { TransitionMap } from '../route-tree/transition-plan';
import type { AuraRoutingProcessorJob } from './cancellation/job';
import { resolveHookNames } from '../lifecycle/phase-attrs';
import { isRenderError, runViewCommit } from '../view-mount/view-render';
import type { RoutePhase } from '../lifecycle/types';
import type { RouteLifecycleContext, RouterInstance } from '../route/types';
import type { TransitionPolicy } from '../transition/policy';
import type { ReportNavigationHookError } from '../failure/navigation-failure';
import { CommitTracker } from '../view-mount/view-mount-tracker';
import type { TransactionResult } from '../navigation/transaction-result';
import { PHASES, type LifecycleStepDef } from '../lifecycle/phase-registry';
import { toLifecycleContext, type LifecycleContextInput } from '../lifecycle/context';
import { runPhaseStep, phaseStepToPipelineOutcome, type PhaseStepOutcome } from '../lifecycle/phase-runner';
import {
  runBlockingPhaseHooks,
  runLoggedPostCommitHooks,
  warnIgnoredPostCommitHookResult,
} from '../hooks/pipeline-hooks';
import { runPhaseHooks } from '../hooks/registry';
import { failPipelineNavigation } from './pipeline-error';
import type { ProcessorRunInput } from './types';

export type { ProcessorRunInput } from './types';

/** Enriched navigation run: {@link ProcessorRunInput} + transition plan and order. */
export interface NavigationTransaction extends ProcessorRunInput {
  plan: TransitionMap;
  /** `null` — skip transitionOut/transitionIn (inactive transition package / effect order). */
  transitionOrder: TransitionPolicy | null;
}

/** Shared ctx for all {@link ProcessorPipeline} steps. */
export interface PipelineContext {
  transaction: NavigationTransaction;
  job: AuraRoutingProcessorJob;
  router: RouterInstance;
  hookRegistry: import('../hooks/registry').HookRegistry;
  commitTracker: CommitTracker;
  reportHookError?: ReportNavigationHookError;
  /** False when the navigation job was superseded or the router was torn down. */
  isJobActive: () => boolean;
  /** History + engine state commit after DOM promotion (commit gate). */
  commitGate?: () => void;
}

/** Pipeline step result: terminal {@link TransactionResult}, or `null` to continue. */
export type PipelineOutcome = TransactionResult | null;

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

  async run(pipelineContext: PipelineContext): Promise<TransactionResult> {
    const { transaction } = pipelineContext;

    if (transaction.plan.reenter) {
      const reenterOutcome = await this.runReenter(pipelineContext);
      if (reenterOutcome) return reenterOutcome;
      if (!pipelineContext.isJobActive()) {
        return { status: 'cancelled' };
      }
      pipelineContext.commitTracker.markViewCommitted();
      pipelineContext.commitGate?.();
      return { status: 'viewCommitted' };
    }

    const outcome = await this.runUntilTerminal(this.steps, pipelineContext);
    return outcome ?? { status: 'viewCommitted' };
  }

  async runReenter(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(PHASES.reenter, pipelineContext);
  }

  async runGuards(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runUntilTerminal(
      [
        (ctx) => this.runLifecycleStep(PHASES.leave, ctx),
        (ctx) => this.runLifecycleStep(PHASES.enter, ctx),
      ],
      pipelineContext,
    );
  }

  async runLoads(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(PHASES.load, pipelineContext);
  }

  async runRenderWithTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    const { transitionOrder } = pipelineContext.transaction;

    if (transitionOrder === null) {
      return this.runRender(pipelineContext);
    }

    if (transitionOrder === 'parallel') {
      return this.runParallelRenderWithTransition(pipelineContext);
    }

    const steps: PipelineStep[] =
      transitionOrder === 'out-in'
        ? [
            (ctx) => this.runExitTransition(ctx),
            (ctx) => this.runRender(ctx),
            (ctx) => this.runEnterTransition(ctx),
          ]
        : [
            (ctx) => this.runRender(ctx),
            (ctx) => this.runEnterTransition(ctx),
            (ctx) => this.runExitTransition(ctx),
          ];

    return this.runUntilTerminal(steps, pipelineContext);
  }

  private async runParallelRenderWithTransition(
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const viewCommitOutcome = await this.runRender(pipelineContext);
    if (viewCommitOutcome) return viewCommitOutcome;

    const [exitTransitionOutcome, enterTransitionOutcome] = await Promise.all([
      this.runExitTransition(pipelineContext),
      this.runEnterTransition(pipelineContext),
    ]);

    const terminal = firstTerminalOutcome(exitTransitionOutcome, enterTransitionOutcome);
    if (terminal) return terminal;

    return null;
  }

  async runAfterRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    if (!pipelineContext.isJobActive()) {
      return { status: 'cancelled' };
    }

    this.commitEnterViews(pipelineContext);
    pipelineContext.commitGate?.();

    await this.runExitCleanup(pipelineContext);
    return this.runLifecycleStep(PHASES.after, pipelineContext);
  }

  async runExitTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(PHASES.transitionOut, pipelineContext);
  }

  async runEnterTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(PHASES.transitionIn, pipelineContext);
  }

  async runRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    for (const matchedRoute of pipelineContext.transaction.plan.enterRoutes) {
      const viewCommit = await runViewCommit(matchedRoute, pipelineContext.job);

      if (viewCommit === 'aborted' || !pipelineContext.isJobActive()) {
        return { status: 'cancelled' };
      }

      if (isRenderError(viewCommit)) {
        await this.runExitCleanup(pipelineContext);
        pipelineContext.commitTracker.markViewCommittedAfterErrorRecovery();
        return failPipelineNavigation(matchedRoute, viewCommit.error, 'render', pipelineContext);
      }

      pipelineContext.commitTracker.markViewStaged();
    }

    return null;
  }

  private commitEnterViews(pipelineContext: PipelineContext): void {
    for (const matchedRoute of pipelineContext.transaction.plan.enterRoutes) {
      matchedRoute.route.commitStagedView?.();
    }
    pipelineContext.commitTracker.markViewCommitted();
  }

  private async runExitCleanup(pipelineContext: PipelineContext): Promise<void> {
    await this.runLifecycleStep(PHASES.left, pipelineContext);
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

  private async runLifecycleStepForRoute(
    step: LifecycleStepDef,
    matchedRoute: MatchedRouteInfo,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    const { route } = matchedRoute;
    const lifecycleContext = toLifecycleContext(
      step.lifecyclePhase,
      matchedRoute,
      this.lifecycleInput(pipelineContext),
    );
    const hookNames = resolveHookNames(route, step.lifecyclePhase);
    const hookRunner = {
      hookRegistry: pipelineContext.hookRegistry,
      isJobActive: pipelineContext.isJobActive,
    };

    return phaseStepToPipelineOutcome(
      await runPhaseStep({
      lifecyclePhase: step.lifecyclePhase,
      onThrow: step.onThrow,
      hookKind: step.hooks.kind,
      hookErrors: step.hooks.kind === 'postCommit' ? step.hooks.hookErrors : undefined,
      invokeRoute: () => step.onRoute(route, lifecycleContext),
      hookNames,
      handlers: {
        runBlockingHooks: (names) =>
          runBlockingPhaseHooks(lifecycleContext, hookRunner, names),
        runPostCommitHooks: (names, hookErrors, phase) =>
          this.runPostCommitHooksStep(
            lifecycleContext,
            hookRunner,
            names,
            hookErrors,
            phase,
          ),
        failWithError: (error) =>
          failPipelineNavigation(
            matchedRoute,
            error,
            step.lifecyclePhase,
            pipelineContext,
          ),
      },
    }),
    );
  }

  private async runPostCommitHooksStep(
    lifecycleContext: RouteLifecycleContext,
    hookRunner: { hookRegistry: PipelineContext['hookRegistry']; isJobActive: () => boolean },
    hookNames: readonly string[],
    hookErrors: 'propagate' | 'log',
    lifecyclePhase: RoutePhase,
  ): Promise<PhaseStepOutcome> {
    const hookResult =
      hookErrors === 'log'
        ? await runLoggedPostCommitHooks(lifecycleContext, hookRunner, hookNames)
        : await runPhaseHooks(
            hookRunner.hookRegistry,
            lifecycleContext,
            hookNames,
            hookRunner.isJobActive,
          );

    warnIgnoredPostCommitHookResult(lifecyclePhase, hookResult);
    return null;
  }

  private lifecycleInput(pipelineContext: PipelineContext): LifecycleContextInput {
    const { transaction, router, job } = pipelineContext;
    return {
      from: transaction.from,
      action: transaction.action,
      router,
      job,
    };
  }
}

function firstTerminalOutcome(...outcomes: PipelineOutcome[]): PipelineOutcome {
  for (const outcome of outcomes) {
    if (outcome) return outcome;
  }

  return null;
}
