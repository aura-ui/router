import type { DataGraph, DataGraphLoadResult, DataSnapshot } from '../data-graph';
import type { ReportNavigationHookError } from '../failure';
import type { HookRegistry } from '../hooks/registry';
import {
  createLifecycleRuntimeContext,
  LifecycleRunner,
  PHASES,
  type LifecycleRuntimeContext,
  type PipelinePhaseDefinition,
} from '../lifecycle';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { TransactionResult } from '../navigation/transaction-result';
import type { RouterInstance } from '../route/types';
import type { TransitionMap } from '../route-tree/transition-plan';
import { ViewCommitTracker } from '../view-mount/view-commit-tracker';
import { isRenderError, runViewCommit } from '../view-mount/view-commit-render';

import type { AuraRoutingProcessorJob } from './cancellation/job';
import type { ProcessorRunInput } from './types';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';

export type { ProcessorRunInput } from './types';

/** Enriched navigation run: {@link ProcessorRunInput} + transition plan and order. */
export interface NavigationTransaction extends Pick<ProcessorRunInput, 'from' | 'to' | 'action'> {
  plan: TransitionMap;
  /** `null` — skip transitionOut/transitionIn (inactive transition package / effect order). */
  transitionOrder: TransitionOrderType | null;
}

/** Shared ctx for all {@link ProcessorPipeline} steps. */
export interface PipelineContext {
  transaction: NavigationTransaction;
  navigationJob: AuraRoutingProcessorJob;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  dataGraph: DataGraph;
  /** Load-hook data for the active branch after {@link DataGraph.load}. */
  dataSnapshot?: DataSnapshot;
  viewCommitTracker: ViewCommitTracker;
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

/**
 * Main pipeline step order — owned here, not in {@link PHASES}.
 * `PHASES` defines per-phase policy and callbacks; this array defines when
 * render, transitions, and commit gate run relative to lifecycle hooks.
 */
const MAIN_PIPELINE: readonly PipelineStepName[] = [
  'guards',
  'loads',
  'renderWithTransition',
  'after',
];

const RENDER_ORDER_STEPS: Record<Exclude<TransitionOrderType, 'parallel'>, readonly PipelineStepName[]> = {
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
      pipelineContext.viewCommitTracker.markViewCommitted();
      pipelineContext.commitGate?.();
      return { status: 'navigationSucceeded' };
    }

    const outcome = await this.runUntilTerminal(this.resolveSteps(MAIN_PIPELINE), pipelineContext);
    return outcome ?? { status: 'navigationSucceeded' };
  }

  private async runReenter(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(PHASES.reenter, pipelineContext);
  }

  private async runGuards(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runUntilTerminal(
      [
        (ctx) => this.runLifecycleStep(PHASES.leave, ctx),
        (ctx) => this.runLifecycleStep(PHASES.enter, ctx),
      ],
      pipelineContext,
    );
  }

  private async runLoads(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    const chain = this.activeChain(pipelineContext);
    const result = await pipelineContext.dataGraph.load(
      this.enterRoutesWithLoadHooks(pipelineContext),
      {
        chain,
        runtime: this.createLifecycleRuntime(pipelineContext),
      },
    );

    this.storeDataSnapshot(pipelineContext, result);
    return result.outcome;
  }

  private async runRenderWithTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
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

  private async runAfterRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    if (!pipelineContext.isJobActive()) {
      return { status: 'cancelled' };
    }

    this.commitEnterViews(pipelineContext);
    pipelineContext.commitGate?.();

    await this.runExitCleanup(pipelineContext);
    return this.runLifecycleStep(PHASES.after, pipelineContext);
  }

  private async runExitTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(PHASES.transitionOut, pipelineContext);
  }

  private async runEnterTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    return this.runLifecycleStep(PHASES.transitionIn, pipelineContext);
  }

  private async runRender(pipelineContext: PipelineContext): Promise<PipelineOutcome> {
    for (const matchedRoute of this.enterRoutes(pipelineContext)) {
      const viewCommit = await runViewCommit(matchedRoute, pipelineContext.navigationJob);

      if (viewCommit === 'aborted' || !pipelineContext.isJobActive()) {
        return { status: 'cancelled' };
      }

      if (isRenderError(viewCommit)) {
        await this.runExitCleanup(pipelineContext);
        pipelineContext.viewCommitTracker.markViewCommittedAfterErrorRecovery();
        return this.lifecycleRunner.failNavigation(
          matchedRoute,
          viewCommit.error,
          'render',
          this.createLifecycleRuntime(pipelineContext),
        );
      }

      pipelineContext.viewCommitTracker.markViewStaged();
    }

    return null;
  }

  private commitEnterViews(pipelineContext: PipelineContext): void {
    for (const matchedRoute of this.enterRoutes(pipelineContext)) {
      matchedRoute.route.commitStagedView?.();
    }
    pipelineContext.viewCommitTracker.markViewCommitted();
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

  private createLifecycleRuntime(pipelineContext: PipelineContext): LifecycleRuntimeContext {
    return createLifecycleRuntimeContext(pipelineContext);
  }

  private enterRoutes(pipelineContext: PipelineContext): readonly MatchedRouteInfo[] {
    return pipelineContext.transaction.plan.enterRoutes;
  }

  /** Full branch root → leaf; reused for LCA snapshot lookup in DataGraph. */
  private activeChain(pipelineContext: PipelineContext): readonly MatchedRouteInfo[] {
    const { plan, to } = pipelineContext.transaction;
    return to.chain ?? plan.enterRoutes;
  }

  private enterRoutesWithLoadHooks(pipelineContext: PipelineContext): MatchedRouteInfo[] {
    return this.enterRoutes(pipelineContext).filter((route) => route.route.load?.length);
  }

  private storeDataSnapshot(
    pipelineContext: PipelineContext,
    result: DataGraphLoadResult,
  ): void {
    if (result.outcome !== null) return;
    pipelineContext.dataSnapshot = result.snapshot;
  }

  private async runLifecycleStep(
    step: PipelinePhaseDefinition,
    pipelineContext: PipelineContext,
  ): Promise<PipelineOutcome> {
    return this.lifecycleRunner.runPhase(step, this.createLifecycleRuntime(pipelineContext));
  }
}

function firstTerminalOutcome(...outcomes: PipelineOutcome[]): PipelineOutcome {
  for (const outcome of outcomes) {
    if (outcome) return outcome;
  }

  return null;
}
