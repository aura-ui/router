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

type transactionRejectedFunc = (id: number, routerGenerationId: number) => boolean;

export class NavigationTransaction {
  readonly from: MatchedRouteInfo | null;
  readonly to: MatchedRouteInfo;
  readonly href: string;
  readonly hash: string;
  readonly action: HistoryAction;
  readonly historyOptions: NavigateHistoryOptions;

  readonly id: number;
  readonly signal: AbortSignal;
  private readonly abortController: AbortController;
  readonly transactionRejected: () => boolean;
  readonly engine: AuraRoutingEngine;
  plan: TransitionMap;
  transitionOrder: TransitionOrderType | null;

  dataSnapshot: DataSnapshot;

  viewCommitTracker: ViewCommitTracker;

  constructor(id: number, routerGenerationId: number, options: NavigationTransactionOptions, transactionRejected: transactionRejectedFunc, engine: AuraRoutingEngine) {
    this.id = id;
    this.from = options.from;
    this.to = options.to;
    this.href = options.href;
    this.hash = options.hash;
    this.action = options.action;
    this.historyOptions = options.options;

    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
    this.transactionRejected = () => transactionRejected(id, routerGenerationId);
    this.engine = engine;

    this.viewCommitTracker = new ViewCommitTracker(options.to.href);
  }

  get aborted(): boolean {
    return this.signal.aborted;
  }

  commitNavigation() {
    this.engine.commitNavigation(this);
    this.viewCommitTracker.markViewCommitted();
  }

  async run(): Promise<TransactionFullResult> {
    this.plan = buildTransitionPlan(this.from, this.to);
    this.transitionOrder = getEnterRoute(this.plan)?.transition?.order ?? null;
    const isFastPath = this.canUseFastPath(this.plan, this.from, this.to);

    return this.rollbackViewWrapper(() => {
      console.log(' PIPLINE running');
      const pipeline = new NavigationTransactionPipeline(this);
      return this.plan.reenter
        ? pipeline.reenter()
        : isFastPath
          ? pipeline.runFastPipeline()
          : pipeline.runFullPipeline();
    });
  }

  cancel() {
    this.abort();
  }

  private abort(reason?: unknown): void {
    if (!this.signal.aborted) {
      console.log('abort happened for ' + this.id);
      this.abortController.abort(reason);
    }
  }

  /** Async work after await must stop when aborted or superseded by a newer tx. */
  isActive(): boolean {
    return !this.aborted && !this.transactionRejected();
  }

  // rollback view if some error happened but view already in stage mode
  async rollbackViewWrapper(func: () => Promise<TransactionFullResult>): Promise<TransactionFullResult> {

    const rollbackStagedViews = () => {
      rollbackUncommittedViews(this.plan, this.viewCommitTracker);
    };

    this.signal.addEventListener('abort', rollbackStagedViews, { once: true });

    let result: TransactionFullResult | undefined;
    try {
      result = await func();
      return result ?? { status: 'navigationSucceeded' }; // если нужно
    } finally {
      this.signal.removeEventListener('abort', rollbackStagedViews);
      if (this.shouldRollbackAfterRun(result)) {
        rollbackStagedViews();
      }
    }
  }

  private shouldRollbackAfterRun(result: TransactionFullResult | undefined): boolean {
    if (this.viewCommitTracker.isViewCommitted()) return false;
    if (this.aborted) return false; // уже откатили в abort listener
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

  //todo use it for old code
  createLifecycleRuntime(): LifecycleRuntimeContext {
    const { id, signal, from, to, action, plan } = this;
    return {
      transaction: { from, to, action, plan },
      navigationJob: { id, signal },
      router: this.engine.router,
      hookRegistry: this.engine.hooksRegistry,
      viewCommitTracker: this.viewCommitTracker,
      isJobActive: () => this.isActive(),
      dataSnapshot: this.dataSnapshot,      // опционально
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