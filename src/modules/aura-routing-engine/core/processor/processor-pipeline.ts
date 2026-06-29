import type { ReportNavigationHookError } from '../failure/navigation-failure';
import { LifecycleRunner } from '../lifecycle/orchestration/lifecycle-runner';
import { PHASES, type PipelinePhaseDefinition } from '../lifecycle/phase-registry';
import type { TransactionResult } from '../navigation/transaction-result';
import type { RouterInstance } from '../route/types';
import type { TransitionMap } from '../route-tree/transition-plan';
import type { TransitionPolicy } from '../transition/policy';
import { CommitTracker } from '../view-mount/view-mount-tracker';
import { isRenderError, runViewCommit } from '../view-mount/view-render';

import type { AuraRoutingProcessorJob } from './cancellation/job';
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

type PipelineStepName =
  | 'guards'
  | 'loads'
  | 'renderWithTransition'
  | 'render'
  | 'transitionOut'
  | 'transitionIn'
  | 'after';
type PipelineStep = (pipelineContext: PipelineContext) => Promise<PipelineOutcome>;

const MAIN_PIPELINE: readonly PipelineStepName[] = [
  'guards',
  'loads',
  'renderWithTransition',
  'after',
];

const RENDER_ORDER_STEPS: Record<Exclude<TransitionPolicy, 'parallel'>, readonly PipelineStepName[]> = {
  'out-in': ['transitionOut', 'render', 'transitionIn'],
  'in-out': ['render', 'transitionIn', 'transitionOut'],
};

/**
 * Navigation transaction pipeline inside {@link AuraRoutingProcessor}.
 *
 * View commit (`runRender`) is not a lifecycle hook; URL commit happens after the processor succeeds.
 * Blocking hooks (`leave`, `enter`, `load`) may cancel or redirect before view commit.
 * Post-commit hooks log cancel/redirect and continue.
 */
export class ProcessorPipeline {
  private readonly lifecycleRunner = new LifecycleRunner();

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
      return { status: 'navigationSucceeded' };
    }

    const outcome = await this.runUntilTerminal(this.resolveSteps(MAIN_PIPELINE), pipelineContext);
    return outcome ?? { status: 'navigationSucceeded' };
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

    return this.runUntilTerminal(
      this.resolveSteps(RENDER_ORDER_STEPS[transitionOrder]),
      pipelineContext,
    );
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
        return this.lifecycleRunner.failNavigation(
          matchedRoute,
          viewCommit.error,
          'render',
          pipelineContext,
        );
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

  private resolveSteps(stepNames: readonly PipelineStepName[]): PipelineStep[] {
    return stepNames.map((name) => (ctx) => this.runNamedStep(name, ctx));
  }

  private runNamedStep(
    name: PipelineStepName,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    switch (name) {
      case 'guards':
        return this.runGuards(pipelineContext);
      case 'loads':
        return this.runLoads(pipelineContext);
      case 'renderWithTransition':
        return this.runRenderWithTransition(pipelineContext);
      case 'render':
        return this.runRender(pipelineContext);
      case 'transitionOut':
        return this.runExitTransition(pipelineContext);
      case 'transitionIn':
        return this.runEnterTransition(pipelineContext);
      case 'after':
        return this.runAfterRender(pipelineContext);
    }
  }

  private async runLifecycleStep(
    step: PipelinePhaseDefinition,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    return this.lifecycleRunner.runPhase(step, pipelineContext);
  }
}

function firstTerminalOutcome(...outcomes: PipelineOutcome[]): PipelineOutcome {
  for (const outcome of outcomes) {
    if (outcome) return outcome;
  }

  return null;
}
