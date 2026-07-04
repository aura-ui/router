import { NavigationTransaction } from './navigation-transaction';
import { PHASES, type RoutePhaseDefinition } from '../lifecycle';
import { NavigationTransactionPipelinePhase } from './navigation-transaction-pipeline-phase';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { type DataGraphLoadResult, resolveRouteData } from '../data-graph';
import { isRenderError, runViewCommit } from '../view-mount/view-commit-render';
import type { TransactionFullResult } from './transaction-result';

export type { TransactionFullResult } from './transaction-result';

type PipelineStep = () => Promise<TransactionFullResult>;

export class NavigationTransactionPipeline {

  private readonly transaction: NavigationTransaction;

  constructor(transaction: NavigationTransaction) {
    this.transaction = transaction;
  }

  async runFullPipeline(): Promise<TransactionFullResult> {
    const outcome = await this.runSequentially([
      () => this.guards(),
      () => this.loads(),
      () => this.renderWithTransitions(),
      () => this.afterRender(),
    ]);
    return outcome ?? { status: 'navigationSucceeded' };
  }

  async runFastPipeline(): Promise<TransactionFullResult> {
    const route = this.transaction.transitionPlan.enterRoutes[0]!;
    const viewCommit = await runViewCommit(route, {
        signal: this.transaction.signal,
        aborted: this.transaction.isAborted,
      },
    );
    if (viewCommit === 'aborted' || !this.transaction.isActive()) {
      return { status: 'cancelled' };
    }
    if (isRenderError(viewCommit)) {
      await this.runPhase(PHASES.left);
      this.transaction.viewCommitTracker.markViewCommittedAfterErrorRecovery();
      return this.transaction.fail(route, viewCommit.error, 'render');
    }
    this.transaction.viewCommitTracker.markViewStaged();
    const result = await this.afterRender();
    return result ?? { status: 'navigationSucceeded' };
  }

  async reenter(): Promise<TransactionFullResult> {
    const reenterOutcome = await this.runPhase(PHASES.reenter);
    if (reenterOutcome) return reenterOutcome;
    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }
    this.transaction.commitNavigation();
    return { status: 'navigationSucceeded' };
  }

  guards(): Promise<TransactionFullResult> {
    return this.runSequentially(
      [
        () => this.runPhase(PHASES.leave),
        () => this.runPhase(PHASES.enter),
      ],
    );
  }

  async loads() {
    const chain = this.activeChain();
    const result = await this.transaction.engine.dataGraph.load(
      this.enterRoutesWithLoadHooks(),
      {
        chain,
        runtime: this.transaction.createLifecycleRuntime(),
      },
    );

    this.storeDataSnapshot(result);
    return result.outcome;
  }

  private storeDataSnapshot(result: DataGraphLoadResult): void {
    if (result.outcome !== null) return;
    this.transaction.dataSnapshot = result.snapshot;
  }

  /** Full branch root → leaf; reused for LCA snapshot lookup in DataGraph. */
  private activeChain(): readonly MatchedRouteInfo[] {
    const { transitionPlan, to } = this.transaction;
    return to.chain ?? transitionPlan.enterRoutes;
  }

  private enterRoutesWithLoadHooks(): MatchedRouteInfo[] {
    return this.transaction.transitionPlan.enterRoutes.filter((route) => route.route.load?.length);
  }

  async render(): Promise<TransactionFullResult> {
    const enterRoutes = this.transaction.transitionPlan.enterRoutes;
    for (const matchedRoute of enterRoutes) {

      const routeData = this.transaction.dataSnapshot
        ? resolveRouteData(this.transaction.dataSnapshot, matchedRoute)
        : undefined;

      const viewCommit = await runViewCommit(
        matchedRoute,
        {
          signal: this.transaction.signal,
          aborted: this.transaction.isAborted,
        },
        routeData !== undefined ? { data: routeData } : undefined,
      );

      if (viewCommit === 'aborted' || !this.transaction.isActive()) {
        return { status: 'cancelled' };
      }

      if (isRenderError(viewCommit)) {
        await this.runPhase(PHASES.left);
        this.transaction.viewCommitTracker.markViewCommittedAfterErrorRecovery();
        return this.transaction.fail(matchedRoute, viewCommit.error, 'render');
      }

      this.transaction.viewCommitTracker.markViewStaged();
    }

    return null;
  }


  async renderWithTransitions(): Promise<TransactionFullResult> {
    const { transitionOrder } = this.transaction;

    if (transitionOrder === null) {
      return this.render();
    }

    if (transitionOrder === 'parallel') {
      const result = await this.render();
      if (result) return result;

      const [exitTransitionOutcome, enterTransitionOutcome] = await Promise.all([
        this.runPhase(PHASES.transitionOut),
        this.runPhase(PHASES.transitionIn),
      ]);

      return exitTransitionOutcome || enterTransitionOutcome || null;
    }

    if (transitionOrder === 'out-in') {
      return this.runSequentially([
          () => this.runPhase(PHASES.transitionOut),
          () => this.render(),
          () => this.runPhase(PHASES.transitionIn),
        ],
      );
    }
    if (transitionOrder === 'in-out') {
      return this.runSequentially([
          () => this.render(),
          () => this.runPhase(PHASES.transitionIn),
          () => this.runPhase(PHASES.transitionOut),
        ],
      );
    }
    return null;
  }

  async afterRender(): Promise<TransactionFullResult> {
    if (!this.transaction.isActive()) {
      return { status: 'cancelled' };
    }


    //just remove stage layer in outlet, after all done
    for (const matchedRoute of this.transaction.transitionPlan.enterRoutes) {
      matchedRoute.route.commitStagedView?.();
    }

    //todo - open question if it is ok that we waiting animation and to call commitNavigation
    //change history, save prev to engine, scroll if needed, call options.onNavigationCommitted
    this.transaction.commitNavigation();
    await this.runPhase(PHASES.left);
    return this.runPhase(PHASES.after);
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


  async runPhase(data: RoutePhaseDefinition): Promise<TransactionFullResult> {
    const matchedRoutes = this.transaction.transitionPlan[data.targetRoutes];

    for (const matchedRoute of matchedRoutes) {
      const result = await NavigationTransactionPipelinePhase.run(matchedRoute, data, this.transaction);
      if (NavigationTransactionPipelinePhase.isPhaseError(result)) {
        return this.transaction.fail(matchedRoute, result.error, result.failedPhase);
      }
      if (result) return result;
    }

    return null;
  }
}
