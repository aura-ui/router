/**
 * Navigation transaction pipeline — ordered lifecycle, data, history, and view-mount steps.
 *
 * Invoked from {@link NavigationTransaction.run} after `buildTransitionPlan`. Three entry
 * points cover the routing tiers:
 *
 * - {@link NavigationTransactionPipeline.runFullPipeline} — standard navigation
 * - {@link NavigationTransactionPipeline.runFastPipeline} — sync / dom-cache / view-cache fast path (no guards/loads)
 * - {@link NavigationTransactionPipeline.runUpdate} — same route record, param/query change
 *
 * @module navigation/navigation-transaction-pipeline
 */
import { isThenable } from '../../../aura-utils/async/is-thenable';
import { NavigationTransaction } from './navigation-transaction';
import { PHASES } from './lifecycle-phases';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';
import { mountEnterBranch } from '../view-mount/branch-mount';
import { isRenderError, runViewCommit } from '../view-mount/view-commit-render';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { TransitionMap } from '../route-tree/transition-plan';
import type { PipelinePhaseDefinition, PipelineStepResult } from './types';

/**
 * Single pipeline step. May return a sync {@link PipelineStepResult} or a Promise.
 * `null` = success and continue; otherwise a terminal result.
 */
type PipelineStep = () => PipelineStepResult | Promise<PipelineStepResult>;

/**
 * Executes one {@link NavigationTransaction} as a sequence of blocking steps.
 *
 * Step contract ({@link PipelineStepResult}):
 * - `null` — step succeeded; run the next step
 * - non-`null` — terminal outcome: `cancelled`, `redirect`, `error`, or (top-level only) `navigationSucceeded`
 *
 * Full path: {@link runLoads} (`ResourceGraph.load` → `viewSnapshot`) then render as sync
 * {@link commitEnterBranchToDom} interleaved with `transition-order`. Param remount uses the same
 * branch commit with `paramChangeRemount` (DomCache restore via `syncBranchMount` early-exit).
 * {@link runFastPipeline} skips loads/transitions (see {@link TransitionMap.canUseFastPath}).
 *
 * **Commit-slice invariant** (do not break): in {@link runAfterRender}, every enter
 * `commitStagedView` and {@link NavigationTransaction.commitNavigation} must run back-to-back
 * with **no `await` between them**. History URL write is earlier ({@link commitHistory} /
 * `commitHistoryIfNeeded`) and is a separate sync step — not part of this slice.
 * A gap between `markViewStaged` and this slice is expected on the transition path
 * (hooks may suspend; supersede rolls back via `rollbackUncommittedViews`).
 *
 * @see docs/MAIN_PIPELINE.md
 * @see `core/ARCHITECTURE.md` § Commit Vocabulary
 * @see docs/todo/PIPELINE_STEP_RUNNER.md (F3)
 */
export class NavigationTransactionPipeline {

  private readonly transaction: NavigationTransaction;

  /**
   * @param transaction — active navigation; must have `transitionPlan` set before any `run*` call
   */
  constructor(transaction: NavigationTransaction) {
    this.transaction = transaction;
  }

  private get pulse() {
    return this.transaction.engine.pulse;
  }

  /**
   * Standard navigation pipeline.
   *
   * Order: prepare (`leave` → `guard` → history → loads) → render → {@link runAfterRender}.
   * Fast path skips prepare markers. `prepare:end` runs only if prepare steps all return `null`.
   *
   * @returns first terminal step result (`error`, `redirect`, `cancelled`), or `navigationSucceeded` when all steps return `null`
   */
  async runFullPipeline(): Promise<PipelineStepResult> {
    const tx = this.transaction;
    return await this.runSequentially([
      () => (this.pulse.prepareStart(tx), null),
      ...(tx.skipBlockingPhases ? [] : [() => this.runGuards()]),
      () => this.commitHistory(),
      () => this.runLoads(), //NOTE: here can be not needed view load, even with cache.dom - it is design desition
      () => (this.pulse.prepareEnd(tx), null),
      () => this.runRenderWithTransition(),
      () => this.runAfterRender(),
    ]) ?? { status: 'navigationSucceeded' };
  }

  /**
   * Fast path — view swap only (sync content, `cache.dom` hit, or warm `cache.view`).
   *
   * Skips guards, data loads, and transition phases. Commits history synchronously, runs a single
   * {@link runViewCommit} on the sole enter route, then {@link runAfterRender}.
   *
   * Selected by {@link TransitionMap.canUseFastPath},
   * {@link ../route-tree/can-use-fast-path!canUseDomCacheFastPath}, or
   * {@link ../route-tree/can-use-fast-path!canUseViewCacheFastPath}.
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
    const tx = this.transaction;
    const stepResult = await this.runSequentially([
      () => (this.pulse.prepareStart(tx), null),
      () => this.commitHistory(),
      () => this.runLoads(),
      () => (this.pulse.prepareEnd(tx), null),
      () => this.runLifecyclePhase(PHASES.update),
    ]);
    if (stepResult) return stepResult;

    if (!tx.isActive()) {
      return { status: 'cancelled' };
    }

    this.pulse.commitStart(tx);
    tx.commitNavigation();
    return { status: 'navigationSucceeded' };
  }

  /**
   * History: write URL (when needed), then URL-aligned chrome sync.
   *
   * {@link AuraRoutingEngine.commitHistoryIfNeeded} →
   * {@link AuraRoutingEngine.notifyUrlAligned} → {@link NavigationPulse.alignUrl}
   */
  private commitHistory(): PipelineStepResult {
    const tx = this.transaction;
    tx.engine.commitHistoryIfNeeded(tx);
    tx.engine.notifyUrlAligned(tx);
    return null;
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
   * Runs after history commit and before render. Emits {@link NavigationPulse.loadStart} /
   * {@link NavigationPulse.loadEnd}; delegates to `engine.resourceGraph.load`; stores
   * the resulting snapshot on the transaction for view commit and lifecycle hooks.
   *
   * `activeChain` is the full target branch (`to.chain`) when present, otherwise enter routes.
   */
  async runLoads(): Promise<PipelineStepResult> {
    const tx = this.transaction;
    const enterRoutes = tx.transitionPlan.enterRoutes;
    const branch = tx.to.chain ?? enterRoutes;

    this.pulse.loadStart(tx, enterRoutes);
    const { error, data, view } = await tx.engine.resourceGraph.load(enterRoutes, { branch, transaction: tx });
    data && (tx.dataSnapshot = data);
    view && (tx.viewSnapshot = view);
    this.pulse.loadEnd(tx, enterRoutes, error, tx.to);
    return error ?? null;
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
   * Content must already be on `transaction.viewSnapshot` ({@link runLoads}).
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
  private renderEnterBranch(
    transitionOrder: TransitionOrderType | null,
  ): PipelineStepResult | Promise<PipelineStepResult> {
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

    return null;
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
  private commitEnterBranchToDom(): PipelineStepResult | Promise<PipelineStepResult> {
    const viewSnapshot = this.transaction.viewSnapshot;
    this.transaction.viewSnapshot = undefined;
    if (!viewSnapshot) return { status: 'cancelled' };

    const tx = this.transaction;
    const mountResult = mountEnterBranch(tx.transitionPlan.enterRoutes, viewSnapshot, {
      signal: tx.signal,
      aborted: () => !tx.isActive(),
      paramChangeRemount: tx.transitionPlan.paramChangeRemount === true,
      dataSnapshot: tx.dataSnapshot,
    });

    if (mountResult.status === 'aborted' || !tx.isActive()) {
      return { status: 'cancelled' };
    }
    if (mountResult.status === 'error') {
      return this.failRender(mountResult.route, mountResult.error);
    }

    tx.viewCommitTracker.markViewStaged();
    return null;
  }

  /**
   * Post-render finalization after staged views are in the DOM.
   *
   * Order: `unmount` (exit branch) → **commit slice**
   * ({@link NavigationPulse.commitStart} → `commitStagedView` × enter →
   * {@link NavigationTransaction.commitNavigation} → {@link NavigationPulse.commitEnd})
   * → `ready` (enter branch).
   *
   * **Invariant:** the commit slice is synchronous — no `await` between the last
   * `commitStagedView` and `commitNavigation`. `unmount` / `ready` may suspend; that is
   * outside the slice. See class JSDoc and `core/ARCHITECTURE.md` § Commit Vocabulary.
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

    // Commit slice — must stay sync (no await between promote and view-success gate).
    this.pulse.commitStart(this.transaction);
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
   * Thenable-aware: sync step results continue without an extra microtask tick; only Promises are awaited.
   *
   * @param steps — ordered step functions (sync or async)
   * @returns first non-`null` step result, `cancelled` if inactive before/during a step, or `null`
   */
  private async runSequentially(steps: PipelineStep[]): Promise<PipelineStepResult> {
    for (const step of steps) {
      if (!this.transaction.isActive()) {
        return { status: 'cancelled' };
      }
      let stepResult = step();
      if (isThenable(stepResult)) {
        stepResult = await stepResult;
      }
      if (stepResult) return stepResult;
    }
    return null;
  }
}
