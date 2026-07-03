import type { MatchedRouteInfo } from '../match/url-matcher';
import { buildTransitionPlan, getEnterRoute, type TransitionMap } from '../route-tree/transition-plan';
import {
  NavigationTransactionPipeline,
  type TransactionFullResult,
} from '../navigation-transaction-pipeline/navigation-transaction-pipeline';
import { AuraRoutingEngine } from '../aura-routing-engine';
import type { NavigationTransactionOptions } from '../navigation-coordinator/navigation-coordinator';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import { type NavigationErrorPhase } from '../failure';
import { ViewCommitTracker } from '../view-mount/view-commit-tracker';
import { ErrorPhaseHandler, type LifecycleRuntimeContext } from '../lifecycle';
import type { DataSnapshot } from '../data-graph';
import { rollbackUncommittedViews } from '../view-mount/view-mount-rollback';

/** Returns true when a newer transaction or router generation superseded this one. */
type IsTransactionStaleCheck = (transactionId: number, routerGenerationId: number) => boolean;

export class NavigationTransaction {
  readonly from: MatchedRouteInfo | null;
  readonly to: MatchedRouteInfo;
  readonly href: string;
  readonly hash: string;
  readonly action: HistoryAction;
  readonly historyOptions: NavigateHistoryOptions;

  readonly transactionId: number;
  readonly signal: AbortSignal;
  private readonly abortController: AbortController;
  readonly isStale: () => boolean;
  readonly engine: AuraRoutingEngine;

  transitionPlan: TransitionMap;
  transitionOrder: TransitionOrderType | null;

  dataSnapshot: DataSnapshot;

  viewCommitTracker: ViewCommitTracker;

  constructor(
    transactionId: number,
    routerGenerationId: number,
    options: NavigationTransactionOptions,
    isTransactionStale: IsTransactionStaleCheck,
    engine: AuraRoutingEngine,
  ) {
    this.transactionId = transactionId;
    this.from = options.from;
    this.to = options.to;
    this.href = options.href;
    this.hash = options.hash;
    this.action = options.action;
    this.historyOptions = options.options;

    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
    this.isStale = () => isTransactionStale(transactionId, routerGenerationId);
    this.engine = engine;

    this.viewCommitTracker = new ViewCommitTracker(options.to.href);
  }

  get isAborted(): boolean {
    return this.signal.aborted;
  }

  commitNavigation() {
    this.engine.commitNavigation(this);
    this.viewCommitTracker.markViewCommitted();
  }

  async run(): Promise<TransactionFullResult> {
    this.transitionPlan = buildTransitionPlan(this.from, this.to);
    this.transitionOrder = getEnterRoute(this.transitionPlan)?.transition?.order ?? null;
    const useFastPath = this.canUseFastPath(this.transitionPlan, this.from, this.to);

    return this.runWithStagedViewRollback(() => {
      const pipeline = new NavigationTransactionPipeline(this);
      return this.transitionPlan.reenter
        ? pipeline.reenter()
        : useFastPath
          ? pipeline.runFastPipeline()
          : pipeline.runFullPipeline();
    });
  }

  cancel() {
    this.signalAbort();
  }

  private signalAbort(reason?: unknown): void {
    if (!this.signal.aborted) {
      this.abortController.abort(reason);
    }
  }

  /** Async work after await must stop when aborted or superseded by a newer transaction. */
  isActive(): boolean {
    return !this.isAborted && !this.isStale();
  }

  private async runWithStagedViewRollback(
    runPipeline: () => Promise<TransactionFullResult>,
  ): Promise<TransactionFullResult> {
    const rollbackStagedViews = () => {
      rollbackUncommittedViews(this.transitionPlan, this.viewCommitTracker);
    };

    this.signal.addEventListener('abort', rollbackStagedViews, { once: true });

    let result: TransactionFullResult | undefined;
    try {
      result = await runPipeline();
      return result ?? { status: 'navigationSucceeded' };
    } finally {
      this.signal.removeEventListener('abort', rollbackStagedViews);
      if (this.shouldRollbackAfterRun(result)) {
        rollbackStagedViews();
      }
    }
  }

  private shouldRollbackAfterRun(result: TransactionFullResult | undefined): boolean {
    if (this.viewCommitTracker.isViewCommitted()) return false;
    if (this.isAborted) return false;
    return result?.status === 'cancelled';
  }

  async fail(
    route: MatchedRouteInfo,
    error: unknown,
    atPhase: NavigationErrorPhase,
  ): Promise<Extract<TransactionFullResult, { status: 'error' }>> {
    const runtime = this.createLifecycleRuntime();
    return new ErrorPhaseHandler().failNavigation(route, error, atPhase, runtime);
  }

  createLifecycleRuntime(): LifecycleRuntimeContext {
    const { transactionId, signal, from, to, action, transitionPlan } = this;
    return {
      transaction: { from, to, action, plan: transitionPlan },
      navigationJob: { id: transactionId, signal },
      router: this.engine.router,
      hookRegistry: this.engine.hooksRegistry,
      viewCommitTracker: this.viewCommitTracker,
      isJobActive: () => this.isActive(),
      dataSnapshot: this.dataSnapshot,
      reportHookError: (hookError, parent) => {
        this.engine.reportNavigationHookError(hookError, parent);
      },
    };
  }

  canUseFastPath(
    plan: TransitionMap,
    _from: MatchedRouteInfo | null,
    _to: MatchedRouteInfo,
  ): boolean {
    if (plan.reenter) return false;
    if (plan.exitRoutes.length > 1 || plan.enterRoutes.length !== 1) return false;

    const exitRoute = plan.exitRoutes[0]?.route;
    const enterRoute = plan.enterRoutes[0]!.route;

    if (exitRoute?.hasLeave) return false;
    if (enterRoute.hasEnter) return false;
    if (enterRoute.hasLoad) return false;
    if (enterRoute.hasTransitionIn) return false;
    if (exitRoute?.hasPostEffects) return false;
    if (enterRoute.hasPostEffects) return false;
    if (enterRoute.hasAsyncContent) return false;
    if (enterRoute.transition.order != null) return false;
    if (exitRoute?.transition.order != null) return false;

    return true;
  }
}
