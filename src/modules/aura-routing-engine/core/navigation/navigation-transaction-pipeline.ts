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
import {
  createBranchResolveContext,
  resolveEnterBranch,
} from '../view-mount/branch-resolver';
import { mountEnterBranch } from '../view-mount/branch-mount';
import {
  isRenderError,
  runViewCommit,
} from '../view-mount/view-commit-render';
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
 * Full path: {@link runPrepare} (`runLoads` → parallel {@link prepareEnterBranch}) then render
 * as sync {@link commitEnterBranchToDom} interleaved with `transition-order`. Param remount uses
 * the same branch commit with `paramChangeRemount` (DomCache restore via `syncBranchMount` early-exit).
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
      () => this.runPrepare(),
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
    const branch = to.chain ?? transitionPlan.enterRoutes;
    const dataGraph = this.transaction.engine.dataGraph;
    // todo should be executed resource Graph to load all content in parallel - data + html + chunks
    const { outcome, snapshot } = await dataGraph.load(
      this.transaction.transitionPlan.enterRoutes,
      {
        branch,
        transaction: this.transaction,
      },
    );
    snapshot && (this.transaction.dataSnapshot = snapshot);
    return outcome ?? null;
  }

  async runPrepare(): Promise<PipelineStepResult> {
    //todo Лишний loadView при DomCache hit
    return this.runSequentially([
      () => this.runLoads(),
      () => this.prepareEnterBranch(),
    ]);
  }

  async runSpeculativePrepare(opts?: {
    data?: boolean;
    view?: boolean;
  }): Promise<PipelineStepResult> {
    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    const data = opts?.data ?? true;
    const view = opts?.view ?? false;
    const { engine, signal, transitionPlan } = this.transaction;
    const enterRoutes = transitionPlan.enterRoutes;

    try {
      const parts: Promise<void>[] = [];

      if (data) {
        parts.push(engine.dataGraph.prefetch(enterRoutes, { signal, mode: 'intent' }));
      }

      if (view) {
        parts.push(engine.viewGraph.prefetchBranch(enterRoutes, signal));
      }

      if (parts.length) {
        await Promise.all(parts);
      }

      if (!this.transaction.isActive()) {
        return { status: 'cancelled' };
      }

      return null;
    } catch {
      if (!this.transaction.isActive()) {
        return { status: 'cancelled' };
      }
      return null;
    }
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
   * Content must already be on `transaction.preResolvedBranchContents` ({@link runPrepare}).
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
   * Atomic render — phase 1: parallel content resolve (no DOM writes).
   *
   * Stores resolved payloads on `transaction.preResolvedBranchContents` for
   * {@link commitEnterBranchToDom}. Render errors trigger {@link failRender}.
   */
  private async prepareEnterBranch(): Promise<PipelineStepResult> {
    const enterRoutes = this.transaction.transitionPlan.enterRoutes;
    const resolveContext = createBranchResolveContext({
      signal: this.transaction.signal,
      dataSnapshot: this.transaction.dataSnapshot,
      isActive: () => this.transaction.isActive(),
      paramChangeRemount: this.transaction.transitionPlan.paramChangeRemount === true,
    });
    const resolved = await resolveEnterBranch(
      enterRoutes,
      this.transaction.engine.viewGraph,
      resolveContext,
    );

    if (resolved.status === 'aborted' || !this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    if (resolved.status === 'error') {
      return this.failRender(resolved.route, resolved.error);
    }

    this.transaction.preResolvedBranchContents = resolved.preResolvedContents;
    return null;
  }

  /**
   * Atomic render — phase 2: sync mount pre-resolved branch into the DOM.
   *
   * Clears `preResolvedBranchContents` after read. Marks the view staged on success.
   * Missing pre-resolved contents yields `cancelled`.
   */
  private commitEnterBranchToDom(): Promise<PipelineStepResult> {
    const preResolvedContents = this.transaction.preResolvedBranchContents;
    this.transaction.preResolvedBranchContents = undefined;

    if (!preResolvedContents) {
      return Promise.resolve({ status: 'cancelled' });
    }

    const enterRoutes = this.transaction.transitionPlan.enterRoutes;
    const resolveContext = createBranchResolveContext({
      signal: this.transaction.signal,
      dataSnapshot: this.transaction.dataSnapshot,
      isActive: () => this.transaction.isActive(),
      paramChangeRemount: this.transaction.transitionPlan.paramChangeRemount === true,
    });
    const mountResult = mountEnterBranch(enterRoutes, preResolvedContents, resolveContext);

    if (mountResult.status === 'aborted' || !this.transaction.isActive()) {
      return Promise.resolve({ status: 'cancelled' });
    }

    if (mountResult.status === 'error') {
      return this.failRender(mountResult.route, mountResult.error);
    }

    this.transaction.viewCommitTracker.markViewStaged();
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
