import type { MatchedRouteInfo } from '../match/url-matcher';
import { buildTransitionPlan, getEnterRoute, type TransitionMap } from '../route-tree/transition-plan';
import { NavigationTransactionPipeline } from './navigation-transaction-pipeline';
import type { TransactionFullResult } from './transaction-result';
import { AuraRoutingEngine } from '../aura-routing-engine';
import type { NavigationTransactionOptions } from './navigation-coordinator';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import { type NavigationErrorPhase } from '../failure';
import { ViewCommitTracker } from '../view-mount/view-commit-tracker';
import { ErrorPhaseHandler, type LifecycleRuntimeContext } from '../lifecycle';
import type { DataSnapshot } from '../data-graph';
import { canUseFastPath } from '../route-tree/can-use-fast-path';
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

  transitionPlan!: TransitionMap;
  transitionOrder: TransitionOrderType | null = null;
  dataSnapshot?: DataSnapshot;
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

  /** Async work after await must stop when aborted or superseded by a newer transaction. */
  isActive(): boolean {
    return !this.isAborted && !this.isStale();
  }

  cancel(reason?: unknown): void {
    if (!this.signal.aborted) {
      this.abortController.abort(reason);
    }
  }

  commitNavigation(): void {
    this.engine.commitNavigation(this);
    this.viewCommitTracker.markViewCommitted();
  }

  async run(): Promise<TransactionFullResult> {
    this.transitionPlan = buildTransitionPlan(this.from, this.to);
    this.transitionOrder = getEnterRoute(this.transitionPlan)?.transition?.order ?? null;

    return this.runWithStagedViewRollback(() => {
      const pipeline = new NavigationTransactionPipeline(this);
      return this.transitionPlan.reenter
        ? pipeline.runReenter()
        : canUseFastPath(this.transitionPlan, this.from, this.to)
          ? pipeline.runFastPipeline()
          : pipeline.runFullPipeline();
    });
  }

  async fail(
    route: MatchedRouteInfo,
    error: unknown,
    atPhase: NavigationErrorPhase,
  ): Promise<Extract<TransactionFullResult, { status: 'error' }>> {
    return new ErrorPhaseHandler().failNavigation(
      route,
      error,
      atPhase,
      this.createLifecycleRuntime(),
    );
  }

  // todo rework
  createLifecycleRuntime(): LifecycleRuntimeContext {
    const { transactionId, signal, from, to, action, transitionPlan } = this;
    return {
      transaction: { from, to, action, plan: transitionPlan },
      navigationJob: { id: transactionId, signal },
      router: this.engine.router,
      hookRegistry: this.engine.hooksRegistry,
      viewCommitTracker: this.viewCommitTracker,
      isJobActive: () => this.isActive(),
      ...(this.dataSnapshot && { dataSnapshot: this.dataSnapshot }),
      reportHookError: (hookError, parent) => {
        this.engine.reportNavigationHookError(hookError, parent);
      },
    };
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
}
