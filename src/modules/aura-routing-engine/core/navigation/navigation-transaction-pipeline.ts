import { NavigationTransaction } from './navigation-transaction';
import { PHASES, type PipelinePhaseDefinition } from '../lifecycle';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { resolveRouteData } from '../data-graph';
import {
  createBranchResolveContext,
  resolveEnterBranch,
  shouldUseBranchMount,
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
import type { TransactionFullResult } from './transaction-result';

export type { TransactionFullResult } from './transaction-result';

type PipelineStep = () => Promise<TransactionFullResult>;

/**
 * Navigation pipeline: guards → loads → history → render (+ transitions) → effects.
 *
 * Terminal outcomes are returned immediately; `null` means the step succeeded
 * and the next step should run ({@link TransactionFullResult}).
 */
export class NavigationTransactionPipeline {

  private readonly transaction: NavigationTransaction;

  constructor(transaction: NavigationTransaction) {
    this.transaction = transaction;
  }

  /** Full path: blocking guards/loads, staged render, promote → gate → unmount → ready. */
  async runFullPipeline(): Promise<TransactionFullResult> {
    const outcome = await this.runSequentially([
      () => this.runGuards(),
      () => this.runLoads(),
      () => this.commitHistoryStep(),
      () => this.runRenderWithTransition(),
      () => this.runAfterRender(),
    ]);
    return outcome ?? { status: 'navigationSucceeded' };
  }

  /** Tier-0 swap: history → view commit → promote → gate → unmount → ready (no guards/loads). */
  async runFastPipeline(): Promise<TransactionFullResult> {
    this.commitHistory();

    const route = this.transaction.transitionPlan.enterRoutes[0]!;
    const viewCommit = await runViewCommit(route, {
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
      return this.failRender(route, viewCommit.error);
    }

    return await this.runAfterRender() ?? { status: 'navigationSucceeded' };
  }

  /** Same leaf route record: load → history → update hooks → view finalize (no guards/render). */
  async runUpdate(): Promise<TransactionFullResult> {
    const outcome = await this.runSequentially([
      () => this.runLoads(),
      () => this.commitHistoryStep(),
      () => this.runLifecyclePhase(PHASES.update),
    ]);
    if (outcome) return outcome;

    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    this.transaction.commitNavigation();
    return { status: 'navigationSucceeded' };
  }

  private commitHistory(): void {
    this.transaction.engine.commitHistoryIfNeeded(this.transaction);
  }

  private commitHistoryStep(): Promise<TransactionFullResult> {
    this.commitHistory();
    return Promise.resolve(null);
  }

  /** Blocking pre-render phases: leave (exit) → guard (enter). */
  runGuards(): Promise<TransactionFullResult> {
    return this.runSequentially([
      () => this.runLifecyclePhase(PHASES.leave),
      () => this.runLifecyclePhase(PHASES.guard),
    ]);
  }

  /** Blocking data load on enter branch — after guards, before render. */
  async runLoads(): Promise<TransactionFullResult> {
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

  /** Test only — render with no `transition-order`. */
  async runRender(): Promise<TransactionFullResult> {
    return this.render(null);
  }

  /** Render interleaved with `transition-order` on the enter route. */
  async runRenderWithTransition(): Promise<TransactionFullResult> {
    return this.render(this.transaction.transitionOrder);
  }

  /**
   * Enter-branch render: atomic (prepare → commit to DOM) or per-route, optionally wrapped in transitions.
   *
   * All nine combinations are listed explicitly below — read top-to-bottom for one scenario.
   */
  private render(transitionOrder: TransitionOrderType | null): Promise<TransactionFullResult> {
    const transitionPlan = this.transaction.transitionPlan;
    const { enterRoutes, paramChangeRemount } = transitionPlan;
    const mountStrategy = getEnterRoute(transitionPlan)?.mountStrategy ?? null;
    const atomic = shouldUseBranchMount({ enterRoutes, paramChangeRemount, mountStrategy, transitionPlan });

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

  private async runTransitionOutInParallel(): Promise<TransactionFullResult> {
    const [transitionOutOutcome, transitionInOutcome] = await Promise.all([
      this.runLifecyclePhase(PHASES.transitionOut),
      this.runLifecyclePhase(PHASES.transitionIn),
    ]);

    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }

    return transitionOutOutcome ?? transitionInOutcome ?? null;
  }

  private async prepareEnterBranch(): Promise<TransactionFullResult> {
    const enterRoutes = this.transaction.transitionPlan.enterRoutes;
    const ctx = createBranchResolveContext(this.transaction);
    const branch = await resolveEnterBranch(
      enterRoutes,
      this.transaction.engine.contentLoad!,
      ctx,
    );

    if (branch.status === 'aborted' || !this.transaction.isActive()) {
      return { status: 'cancelled' };
    }
    if (branch.status === 'error') {
      return this.failRender(branch.route, branch.error);
    }

    this.transaction.resolvedBranchPayloads = branch.payloads;
    return null;
  }

  private commitEnterBranchToDom(): Promise<TransactionFullResult> {
    const payloads = this.transaction.resolvedBranchPayloads;
    this.transaction.resolvedBranchPayloads = undefined;

    if (!payloads) {
      return Promise.resolve({ status: 'cancelled' });
    }

    const enterRoutes = this.transaction.transitionPlan.enterRoutes;
    const ctx = createBranchResolveContext(this.transaction);
    const mount = mountEnterBranch(enterRoutes, payloads, ctx);

    if (mount.status === 'aborted' || !this.transaction.isActive()) {
      return Promise.resolve({ status: 'cancelled' });
    }
    if (mount.status === 'error') {
      return this.failRender(mount.route, mount.error);
    }

    this.transaction.viewCommitTracker.markViewStaged();
    return Promise.resolve(null);
  }

  private async renderEnterRoutes(): Promise<TransactionFullResult> {
    const enterRoutes = this.transaction.transitionPlan.enterRoutes;
    const cancellation: ViewRenderCancellation = {
      signal: this.transaction.signal,
      isAborted: () => !this.transaction.isActive(),
    };

    for (let i = 0; i < enterRoutes.length; i++) {
      const matchedRoute = enterRoutes[i]!;
      const viewCommit = await runViewCommit(
        matchedRoute,
        cancellation,
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
   * Post-render effects: promote staged views → commit gate → unmount → ready.
   * Param remount (same leaf): unmount outgoing → promote → commit gate → ready.
   */
  async runAfterRender(): Promise<TransactionFullResult> {
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

  /** Runs one lifecycle phase for every route on its target branch. */
  async runLifecyclePhase(phaseDef: PipelinePhaseDefinition): Promise<TransactionFullResult> {
    const matchedRoutes = this.transaction.transitionPlan[phaseDef.targetRoutes];
    for (const matchedRoute of matchedRoutes) {
      const result = await NavigationTransactionPipelinePhase.run(
        matchedRoute,
        phaseDef,
        this.transaction,
      );
      if (NavigationTransactionPipelinePhase.isPhaseError(result)) {
        return this.transaction.fail(matchedRoute, result.error, result.failedPhase);
      }
      if (result) return result;
    }
    return null;
  }

  private async failRender(
    matchedRoute: MatchedRouteInfo,
    error: unknown,
  ): Promise<TransactionFullResult> {
    await this.runLifecyclePhase(PHASES.unmount);
    this.transaction.viewCommitTracker.markViewCommittedAfterErrorRecovery();
    return this.transaction.fail(matchedRoute, error, 'render');
  }

  /** Load payload + remount flag for one enter route (full pipeline render only). */
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

  private async runSequentially(steps: PipelineStep[]): Promise<TransactionFullResult> {
    for (const step of steps) {
      if (!this.transaction.isActive()) {
        return { status: 'cancelled' };
      }
      const outcome = await step();
      if (outcome) return outcome;
    }
    return null;
  }
}
