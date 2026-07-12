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
import { resolveRouteData } from '../data-graph';
import {
  createBranchResolveContext,
  resolveEnterBranch,
  shouldUsePrepareCommitEnterBranch,
} from '../view-mount/branch-resolver';
import { getEnterRoute } from '../route-tree/transition-plan';
import { mountEnterBranch } from '../view-mount/branch-mount';
import {
  isRenderError,
  runViewCommit,
  type ViewCommitRenderOptions,
  type ViewRenderCancellation,
} from '../view-mount/view-commit-render';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import type { MatchedRouteInfo } from '../match/url-matcher';
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
 * Render path splits on {@link shouldUsePrepareCommitEnterBranch}:
 * - **atomic** — parallel resolve ({@link prepareEnterBranch}) then sync DOM mount ({@link commitEnterBranchToDom})
 * - **per-route** (`!atomic`) — sequential {@link runViewCommit} on each enter route via {@link renderEnterRoutes}
 *
 * Both render paths honor `transition-order` on the enter leaf. {@link runFastPipeline} skips transitions
 * entirely (see {@link canUseFastPath}).
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
   * Order: `leave` → `guard` → {@link runLoads} → history commit → render (with transitions) →
   * {@link runAfterRender}.
   *
   * @returns first terminal step result (`error`, `redirect`, `cancelled`), or `navigationSucceeded` when all steps return `null`
   */
  async runFullPipeline(): Promise<PipelineStepResult> {
    const blockingPhasesCompleted = this.applyCompletedBlockingPhases();
    const steps: PipelineStep[] = [];

    if (!blockingPhasesCompleted) {
      steps.push(() => this.runGuards(), () => this.runLoads());
    }

    steps.push(
      () => this.runCommitHistory(),
      () => this.runRenderWithTransition(),
      () => this.runAfterRender(),
    );

    const stepResult = await this.runSequentially(steps);
    return stepResult ?? { status: 'navigationSucceeded' };
  }

  /**
   * Blocking pre-commit probe — leave, guard, load only.
   * Used by {@link ../redirect/navigation-chain!resolveRedirectChain} to detect hook redirects
   * before view commit.
   */
  async runBlockingOnly(): Promise<PipelineStepResult> {
    return await this.runSequentially([
      () => this.runGuards(),
      () => this.runLoads(),
    ]);
  }

  /**
   * Tier-0 fast path — view swap only.
   *
   * Skips guards, data loads, and transition phases. Commits history synchronously, runs a single
   * {@link runViewCommit} on the sole enter route, then {@link runAfterRender}.
   *
   * Selected by {@link canUseFastPath}: flat swap (one exit, one enter), no blocking hooks,
   * no async content, no `transition-order`.
   *
   * @returns `cancelled` on abort/supersede; render errors via {@link failRender}; otherwise {@link runAfterRender} result or `navigationSucceeded`
   */
  async runFastPipeline(): Promise<PipelineStepResult> {
    this.commitHistory();

    const enterRoute = this.transaction.transitionPlan.enterRoutes[0]!;
    const viewCommit = await runViewCommit(enterRoute, {
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
      return this.failRender(enterRoute, viewCommit.error);
    }

    return await this.runAfterRender() ?? { status: 'navigationSucceeded' };
  }

  /**
   * In-place update on the same route record (param/query change).
   *
   * Order: {@link runLoads} → history commit → `update` lifecycle phase →
   * {@link NavigationTransaction.commitNavigation} (no guards, render, `unmount`, or `ready`).
   *
   * @returns terminal result from loads/update (`error`, `redirect`, `cancelled`), or `navigationSucceeded`
   */
  async runUpdate(): Promise<PipelineStepResult> {
    const steps: PipelineStep[] = [];

    if (!this.applyCompletedBlockingPhases()) {
      steps.push(() => this.runLoads());
    }

    steps.push(
      () => this.runCommitHistory(),
      () => this.runLifecyclePhase(PHASES.update),
    );

    const stepResult = await this.runSequentially(steps);
    if (stepResult) return stepResult;

    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    this.transaction.commitNavigation();
    return { status: 'navigationSucceeded' };
  }

  /** Applies {@link CompletedBlockingPhases} snapshot; returns true when blocking was already done. */
  private applyCompletedBlockingPhases(): boolean {
    const completed = this.transaction.completedBlockingPhases;
    if (completed === undefined) return false;
    if (completed.dataSnapshot) {
      this.transaction.dataSnapshot = completed.dataSnapshot;
    }
    return true;
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
   * Runs after guards and before render. Delegates to `engine.dataGraph.load`; stores
   * the resulting snapshot on the transaction for view commit and lifecycle hooks.
   *
   * `activeChain` is the full target branch (`to.chain`) when present, otherwise enter routes.
   */
  async runLoads(): Promise<PipelineStepResult> {
    const { to, transitionPlan } = this.transaction;
    const activeChain = to.chain ?? transitionPlan.enterRoutes;
    const { outcome, snapshot } = await this.transaction.engine.dataGraph.load(
      this.transaction.transitionPlan.enterRoutes,
      {
        activeChain,
        transaction: this.transaction,
      },
    );
    snapshot && (this.transaction.dataSnapshot = snapshot);
    return outcome ?? null;
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
   * Render enter branch with `transition-order` from the enter leaf route.
   *
   * Resolves `transitionOrder` from the transaction (set in {@link NavigationTransaction.run}).
   */
  async runRenderWithTransition(): Promise<PipelineStepResult> {
    return this.renderEnterBranch(this.transaction.transitionOrder);
  }

  /**
   * Dispatches enter-branch render for atomic vs per-route mode and `transition-order`.
   *
   * **Atomic** (`prepare` → `commit`): parallel content resolve, then sync mount root→leaf.
   * **Per-route**: sequential {@link runViewCommit} on each enter route.
   *
   * | atomic | transition-order | step sequence |
   * |--------|------------------|---------------|
   * | yes    | `null`           | prepare → commit |
   * | yes    | `out-in`         | prepare → transitionOut → commit → transitionIn |
   * | yes    | `parallel`       | prepare → commit → transitionOut ∥ transitionIn |
   * | yes    | `in-out`         | prepare → commit → transitionIn → transitionOut |
   * | no     | `null`           | renderEnterRoutes |
   * | no     | `out-in`         | transitionOut → renderEnterRoutes → transitionIn |
   * | no     | `parallel`       | renderEnterRoutes → transitionOut ∥ transitionIn |
   * | no     | `in-out`         | renderEnterRoutes → transitionIn → transitionOut |
   * | either | (invalid order) | `null` — defensive fallthrough; all valid {@link TransitionOrderType} values are handled above |
   *
   * @param transitionOrder — enter leaf `transition-order`, or `null` when absent
   */
  private renderEnterBranch(transitionOrder: TransitionOrderType | null): Promise<PipelineStepResult> {
    const transitionPlan = this.transaction.transitionPlan;
    const { enterRoutes, paramChangeRemount } = transitionPlan;
    const mountStrategy = getEnterRoute(transitionPlan)?.mountStrategy ?? null;
    const atomic = shouldUsePrepareCommitEnterBranch({
      enterRoutes,
      paramChangeRemount,
      mountStrategy,
      transitionPlan,
    });

    if (atomic && transitionOrder === null) {
      return this.runSequentially([
        () => this.prepareEnterBranch(),
        () => this.commitEnterBranchToDom(),
      ]);
    }

    if (atomic && transitionOrder === 'out-in') {
      return this.runSequentially([
        () => this.prepareEnterBranch(),
        () => this.runLifecyclePhase(PHASES.transitionOut),
        () => this.commitEnterBranchToDom(),
        () => this.runLifecyclePhase(PHASES.transitionIn),
      ]);
    }

    if (atomic && transitionOrder === 'parallel') {
      return this.runSequentially([
        () => this.prepareEnterBranch(),
        () => this.commitEnterBranchToDom(),
        () => this.runTransitionOutInParallel(),
      ]);
    }

    if (atomic && transitionOrder === 'in-out') {
      return this.runSequentially([
        () => this.prepareEnterBranch(),
        () => this.commitEnterBranchToDom(),
        () => this.runLifecyclePhase(PHASES.transitionIn),
        () => this.runLifecyclePhase(PHASES.transitionOut),
      ]);
    }

    if (!atomic && transitionOrder === null) {
      return this.runSequentially([() => this.renderEnterRoutes()]);
    }

    if (!atomic && transitionOrder === 'out-in') {
      return this.runSequentially([
        () => this.runLifecyclePhase(PHASES.transitionOut),
        () => this.renderEnterRoutes(),
        () => this.runLifecyclePhase(PHASES.transitionIn),
      ]);
    }

    if (!atomic && transitionOrder === 'parallel') {
      return this.runSequentially([
        () => this.renderEnterRoutes(),
        () => this.runTransitionOutInParallel(),
      ]);
    }

    if (!atomic && transitionOrder === 'in-out') {
      return this.runSequentially([
        () => this.renderEnterRoutes(),
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
    const resolveContext = createBranchResolveContext(this.transaction);
    const resolved = await resolveEnterBranch(
      enterRoutes,
      this.transaction.engine.viewGraph!,
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
    const resolveContext = createBranchResolveContext(this.transaction);
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
   * Per-route render: sequential {@link runViewCommit} on each enter route (root → leaf).
   *
   * Passes load-hook data and `paramChangeRemount` via {@link viewCommitOptions}.
   * Stops on first abort, cancel, or render error.
   */
  private async renderEnterRoutes(): Promise<PipelineStepResult> {
    const enterRoutes = this.transaction.transitionPlan.enterRoutes;
    const viewRenderCancellation: ViewRenderCancellation = {
      signal: this.transaction.signal,
      isAborted: () => !this.transaction.isActive(),
    };

    for (let i = 0; i < enterRoutes.length; i++) {
      const matchedRoute = enterRoutes[i]!;
      const viewCommit = await runViewCommit(
        matchedRoute,
        viewRenderCancellation,
        this.viewCommitOptions(matchedRoute),
      );

      if (viewCommit === 'ok') {
        this.transaction.viewCommitTracker.markViewStaged();
      }
      if (viewCommit === 'aborted' || !this.transaction.isActive()) {
        return { status: 'cancelled' };
      }
      if (isRenderError(viewCommit)) {
        return this.failRender(matchedRoute, viewCommit.error);
      }
    }

    return null;
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
   * Per-route view-commit options ({@link renderEnterRoutes} only; atomic path uses
   * {@link createBranchResolveContext} / `dataFor` instead).
   *
   * Attaches load-hook payload from `dataSnapshot` when present and sets
   * `paramChangeRemount` when the transition plan requests in-place remount.
   */
  private viewCommitOptions(matchedRoute: MatchedRouteInfo): ViewCommitRenderOptions | undefined {
    const options: ViewCommitRenderOptions = {};
    const snapshot = this.transaction.dataSnapshot;
    if (snapshot) {
      const routeData = resolveRouteData(snapshot, matchedRoute);
      if (routeData !== undefined) options.data = routeData;
    }
    if (this.transaction.transitionPlan.paramChangeRemount) {
      options.paramChangeRemount = true;
    }
    return Object.keys(options).length > 0 ? options : undefined;
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
