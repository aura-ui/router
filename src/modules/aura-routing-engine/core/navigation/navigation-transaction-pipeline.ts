import { NavigationTransaction } from './navigation-transaction';
import { PHASES, type PipelinePhaseDefinition } from '../lifecycle';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { resolveRouteData } from '../data-graph';
import { isRenderError, runViewCommit, type ViewCommitRenderOptions } from '../view-mount/view-commit-render';
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
      aborted: this.transaction.isAborted,
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

  /** Staged view commit for all enter routes (no transition wrappers). */
  async runRender(): Promise<TransactionFullResult> {
    for (const matchedRoute of this.transaction.transitionPlan.enterRoutes) {
      const viewCommit = await runViewCommit(
        matchedRoute,
        {
          signal: this.transaction.signal,
          aborted: this.transaction.isAborted,
        },
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
   * Render wrapped by `transition-order` on the enter route (see MAIN_PIPELINE §2).
   */
  async runRenderWithTransition(): Promise<TransactionFullResult> {
    const { transitionOrder } = this.transaction;

    if (transitionOrder === null) {
      return this.runRender();
    }

    if (transitionOrder === 'parallel') {
      const renderOutcome = await this.runRender();
      if (renderOutcome) return renderOutcome;

      const [transitionOutOutcome, transitionInOutcome] = await Promise.all([
        this.runLifecyclePhase(PHASES.transitionOut),
        this.runLifecyclePhase(PHASES.transitionIn),
      ]);

      if (!this.transaction.isActive()) {
        return { status: 'cancelled' };
      }

      return transitionOutOutcome ?? transitionInOutcome ?? null;
    }

    if (transitionOrder === 'out-in') {
      return this.runSequentially([
        () => this.runLifecyclePhase(PHASES.transitionOut),
        () => this.runRender(),
        () => this.runLifecyclePhase(PHASES.transitionIn),
      ]);
    }

    if (transitionOrder === 'in-out') {
      return this.runSequentially([
        () => this.runRender(),
        () => this.runLifecyclePhase(PHASES.transitionIn),
        () => this.runLifecyclePhase(PHASES.transitionOut),
      ]);
    }

    return null;
  }

  /**
   * Post-commit effects: promote staged views → view finalize → unmount → ready.
   */
  async runAfterRender(): Promise<TransactionFullResult> {
    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }
    for (const matchedRoute of this.transaction.transitionPlan.enterRoutes) {
      matchedRoute.route.commitStagedView?.();
    }
    this.transaction.commitNavigation();
    await this.runLifecyclePhase(PHASES.unmount);
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
