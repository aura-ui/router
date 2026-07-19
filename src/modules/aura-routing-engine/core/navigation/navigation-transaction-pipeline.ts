/**
 * Navigation transaction pipeline — ordered lifecycle, data, history, and view-mount steps.
 *
 * Invoked from {@link NavigationTransaction.run} after `buildTransitionPlan`. Three entry
 * points cover the routing tiers:
 *
 * - {@link NavigationTransactionPipeline.runFullPipeline} — standard navigation
 * - {@link NavigationTransactionPipeline.runFastPipeline} — Tier 0 (no guards/loads)
 * - {@link NavigationTransactionPipeline.runUpdate} — same route record, param/query change
 *
 * @module navigation/navigation-transaction-pipeline
 */
import { NavigationTransaction } from './navigation-transaction';
import { PHASES } from './lifecycle-phases';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';
import { mountEnterBranch } from '../view-mount/branch-mount';
import { isRenderError, runViewCommit } from '../view-mount/view-commit-render';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { TransitionMap } from '../route-tree/transition-plan';
import type { PipelinePhaseDefinition, PipelineStepResult } from './types';

/** Single pipeline step. `null` = success and continue; otherwise a terminal {@link PipelineStepResult}. */
type PipelineStep = () => Promise<PipelineStepResult>;

/**
 * Executes one {@link NavigationTransaction} as a sequence of blocking steps.
 *
 * Step contract ({@link PipelineStepResult}):
 * - `null` — step succeeded; run the next step
 * - non-`null` — terminal outcome: `cancelled`, `redirect`, `error`, or (top-level only) `navigationSucceeded`
 *
 * Full path: {@link runPrepare} (`ResourceGraph.load` → `viewSnapshot`) then render as sync
 * {@link commitEnterBranchToDom} interleaved with `transition-order`. Param remount uses the same
 * branch commit with `paramChangeRemount` (DomCache restore via `syncBranchMount` early-exit).
 * {@link runFastPipeline} skips prepare/transitions (see {@link TransitionMap.canUseFastPath}).
 *
 * @see docs/MAIN_PIPELINE.md
 */
export class NavigationTransactionPipeline {

  private readonly transaction: NavigationTransaction;

  /**
   * @param transaction — active navigation; must have `transitionPlan` set before any `run*` call
   */
  constructor(transaction: NavigationTransaction) {
    this.transaction = transaction;
  }

  /**
   * Standard navigation pipeline.
   *
   * Order: `leave` → `guard` → history commit → {@link runPrepare} → render (with transitions) →
   * {@link runAfterRender}.
   *
   * @returns first terminal step result (`error`, `redirect`, `cancelled`), or `navigationSucceeded` when all steps return `null`
   */
  async runFullPipeline(): Promise<PipelineStepResult> {
    return await this.runSequentially([
      ...(this.transaction.skipBlockingPhases ? [] : [() => this.runGuards()]),
      () => this.runCommitHistory(),
      () => this.runNavigationPrepare(),
      () => this.runRenderWithTransition(),
      () => this.runAfterRender(),
    ]) ?? { status: 'navigationSucceeded' };
  }

  /**
   * Tier-0 fast path — view swap only.
   *
   * Skips guards, data loads, and transition phases. Commits history synchronously, runs a single
   * {@link runViewCommit} on the sole enter route, then {@link runAfterRender}.
   *
   * Selected by {@link TransitionMap.canUseFastPath}: flat swap (one exit, one enter), no blocking hooks,
   * no async content, no `transition-order`.
   *
   * @returns `cancelled` on abort/supersede; render errors via {@link failRender}; otherwise {@link runAfterRender} result or `navigationSucceeded`
   */
  // todo move to branch API??
  async runFastPipeline(): Promise<PipelineStepResult> {
    this.commitHistory();

    const enterMatch = this.transaction.transitionPlan.enterMatch!;
    const viewCommit = await runViewCommit(enterMatch, {
      signal: this.transaction.signal,
      isAborted: () => !this.transaction.isActive(),
    });

    if (viewCommit === 'ok') {
      this.transaction.viewCommitTracker.markViewStaged();
    }

    if (viewCommit === 'aborted' || !this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    if (isRenderError(viewCommit)) {
      return this.failRender(enterMatch, viewCommit.error);
    }

    return await this.runAfterRender() ?? { status: 'navigationSucceeded' };
  }

  /**
   * In-place update on the same route record (param/query change).
   *
   * Order: history commit → {@link runLoads} → `update` lifecycle phase →
   * {@link NavigationTransaction.commitNavigation} (no guards, render, `unmount`, or `ready`).
   *
   * @returns terminal result from loads/update (`error`, `redirect`, `cancelled`), or `navigationSucceeded`
   */
  async runUpdate(): Promise<PipelineStepResult> {
    const stepResult = await this.runSequentially([
      () => this.runCommitHistory(),
      () => this.runLoads(),
      () => this.runLifecyclePhase(PHASES.update),
    ]);
    if (stepResult) return stepResult;

    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    this.transaction.commitNavigation();
    return { status: 'navigationSucceeded' };
  }

  /** Writes browser history when the transaction's history policy requires it. */
  private commitHistory(): void {
    this.transaction.engine.commitHistoryIfNeeded(this.transaction);
  }

  /** Pipeline step wrapper around {@link commitHistory}. */
  private runCommitHistory(): Promise<PipelineStepResult> {
    this.commitHistory();
    return Promise.resolve(null);
  }

  /**
   * Blocking pre-render lifecycle phases on exit and enter branches.
   *
   * Order: `leave` (exit routes) → `guard` (enter routes). Redirect or hook failure
   * stops the pipeline before loads/render.
   */
  runGuards(): Promise<PipelineStepResult> {
    return this.runSequentially([
      () => this.runLifecyclePhase(PHASES.leave),
      () => this.runLifecyclePhase(PHASES.guard),
    ]);
  }

  /**
   * Blocking data load for the enter branch.
   *
   * Runs after history commit and before render. Delegates to `engine.dataGraph.load`; stores
   * the resulting snapshot on the transaction for view commit and lifecycle hooks.
   *
   * `activeChain` is the full target branch (`to.chain`) when present, otherwise enter routes.
   */
  async runLoads(): Promise<PipelineStepResult> {
    const { to, transitionPlan } = this.transaction;
    const enterRoutes = transitionPlan.enterRoutes;
    const branch = to.chain ?? enterRoutes;
    const resourceGraph = this.transaction.engine.resourceGraph;
    const { error, data, view } = await resourceGraph.load(enterRoutes, { branch, transaction: this.transaction });
    data && (this.transaction.dataSnapshot = data);
    view && (this.transaction.viewSnapshot = view);
    return error ?? null;
  }

  private async runNavigationPrepare(): Promise<PipelineStepResult> {
    //todo Лишний loadView при DomCache hit
    return this.runSequentially([
      () => this.runLoads(),
    ]);
  }

  async runSpeculativePrepare(): Promise<void> {
    const { to, transitionPlan, engine } = this.transaction;
    const enterRoutes = transitionPlan.enterRoutes;
    await engine.resourceGraph.load(enterRoutes, {
      branch: to.chain ?? enterRoutes,
      transaction: this.transaction,
    });
  }

  /**
   * Render enter branch without `transition-order` interleaving.
   *
   * @internal Test and diagnostic entry — production uses {@link runRenderWithTransition}.
   */
  async runRender(): Promise<PipelineStepResult> {
    return this.renderEnterBranch(null);
  }

  /**
   * Render enter branch with `transition-order` from the enter leaf
   * ({@link TransitionMap.transitionOrder}).
   */
  async runRenderWithTransition(): Promise<PipelineStepResult> {
    return this.renderEnterBranch(this.transaction.transitionPlan.transitionOrder);
  }

  /**
   * Commit enter-branch DOM with `transition-order` from the enter leaf.
   *
   * Content must already be on `transaction.viewSnapshot` ({@link runPrepare}).
   *
   * | transition-order | step sequence |
   * |------------------|---------------|
   * | `null`           | commit |
   * | `out-in`         | transitionOut → commit → transitionIn |
   * | `parallel`       | commit → transitionOut ∥ transitionIn |
   * | `in-out`         | commit → transitionIn → transitionOut |
   *
   * @param transitionOrder — enter leaf `transition-order`, or `null` when absent
   */
  private renderEnterBranch(transitionOrder: TransitionOrderType | null): Promise<PipelineStepResult> {
    if (transitionOrder === null) {
      return this.commitEnterBranchToDom();
    }

    if (transitionOrder === 'out-in') {
      return this.runSequentially([
        () => this.runLifecyclePhase(PHASES.transitionOut),
        () => this.commitEnterBranchToDom(),
        () => this.runLifecyclePhase(PHASES.transitionIn),
      ]);
    }

    if (transitionOrder === 'parallel') {
      return this.runSequentially([
        () => this.commitEnterBranchToDom(),
        () => this.runTransitionOutInParallel(),
      ]);
    }

    if (transitionOrder === 'in-out') {
      return this.runSequentially([
        () => this.commitEnterBranchToDom(),
        () => this.runLifecyclePhase(PHASES.transitionIn),
        () => this.runLifecyclePhase(PHASES.transitionOut),
      ]);
    }

    return Promise.resolve(null);
  }

  /**
   * Runs `transition-out` and `transition-in` concurrently.
   *
   * After both settle: `cancelled` if inactive; otherwise `transitionOut` outcome, else `transitionIn`,
   * else `null`.
   */
  private async runTransitionOutInParallel(): Promise<PipelineStepResult> {
    const [transitionOutOutcome, transitionInOutcome] = await Promise.all([
      this.runLifecyclePhase(PHASES.transitionOut),
      this.runLifecyclePhase(PHASES.transitionIn),
    ]);

    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    return transitionOutOutcome ?? transitionInOutcome ?? null;
  }

  /**
   * Atomic render: sync-mount {@link NavigationTransaction.viewSnapshot} into the DOM.
   * Clears the snapshot after read. Missing snapshot → `cancelled`.
   */
  private commitEnterBranchToDom(): Promise<PipelineStepResult> {
    const viewSnapshot = this.transaction.viewSnapshot;
    this.transaction.viewSnapshot = undefined;
    if (!viewSnapshot) return Promise.resolve({ status: 'cancelled' });

    const tx = this.transaction;
    const mountResult = mountEnterBranch(tx.transitionPlan.enterRoutes, viewSnapshot, {
      signal: tx.signal,
      aborted: () => !tx.isActive(),
      paramChangeRemount: tx.transitionPlan.paramChangeRemount === true,
      dataSnapshot: tx.dataSnapshot,
    });

    if (mountResult.status === 'aborted' || !tx.isActive()) {
      return Promise.resolve({ status: 'cancelled' });
    }
    if (mountResult.status === 'error') {
      return this.failRender(mountResult.route, mountResult.error);
    }

    tx.viewCommitTracker.markViewStaged();
    return Promise.resolve(null);
  }

  /**
   * Post-render finalization after staged views are in the DOM.
   *
   * Order: `unmount` (exit branch) → `commitStagedView` on each enter route →
   * {@link NavigationTransaction.commitNavigation} → `ready` (enter branch).
   *
   * Param-change remount follows the same sequence globally for successful navigations.
   */
  async runAfterRender(): Promise<PipelineStepResult> {
    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    const unmountOutcome = await this.runLifecyclePhase(PHASES.unmount);
    if (unmountOutcome) return unmountOutcome;

    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    for (const matchedRoute of this.transaction.transitionPlan.enterRoutes) {
      matchedRoute.route.commitStagedView?.();
    }
    this.transaction.commitNavigation();
    return this.runLifecyclePhase(PHASES.ready);
  }

  /**
   * Runs one registered lifecycle phase on every route in its target branch.
   *
   * Target routes come from `transitionPlan[phaseDef.targetRoutes]` (e.g. `exitRoutes`,
   * `enterRoutes`). Blocking phases may return `redirect` / `cancelled`; failures use
   * {@link NavigationTransaction.fail}.
   *
   * @param phaseDef — entry from {@link PHASES} registry
   * @returns first terminal result, or `null` when all routes complete successfully
   */
  async runLifecyclePhase(phaseDef: PipelinePhaseDefinition): Promise<PipelineStepResult> {
    const matchedRoutes = this.transaction.transitionPlan[phaseDef.targetRoutes];
    for (const matchedRoute of matchedRoutes) {
      const result = await NavigationTransactionPipelinePhase.run(
        matchedRoute,
        phaseDef,
        this.transaction,
      );
      if (NavigationTransactionPipelinePhase.isRoutePhaseFailure(result)) {
        return this.transaction.fail(matchedRoute, result.error, result.phase);
      }
      if (result) return result;
    }
    return null;
  }

  /**
   * Render failure recovery: unmount exit branch, mark view committed after error recovery,
   * then delegate to {@link NavigationTransaction.fail} with phase `'render'`.
   */
  private async failRender(
    matchedRoute: MatchedRouteInfo,
    error: unknown,
  ): Promise<PipelineStepResult> {
    await this.runLifecyclePhase(PHASES.unmount);
    this.transaction.viewCommitTracker.markViewCommittedAfterErrorRecovery();
    return this.transaction.fail(matchedRoute, error, 'render');
  }

  /**
   * Runs pipeline steps in order until one returns a terminal result or the transaction is inactive.
   *
   * @param steps — ordered step functions
   * @returns first non-`null` step result, `cancelled` if inactive before/during a step, or `null`
   */
  private async runSequentially(steps: PipelineStep[]): Promise<PipelineStepResult> {
    for (const step of steps) {
      if (!this.transaction.isActive()) {
        return { status: 'cancelled' };
      }
      const stepResult = await step();
      if (stepResult) return stepResult;
    }
    return null;
  }
}
