import type { MatchedRouteInfo } from '../match/url-matcher';
import { buildTransitionPlan, getEnterRoute, type TransitionMap } from '../route-tree/transition-plan';
import { NavigationTransactionPipeline } from './navigation-transaction-pipeline';
import type { PipelineStepResult, TransactionResult } from './types';
import { AuraRoutingEngine } from '../aura-routing-engine';
import type { NavigationTransactionOptions } from './types';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import { type NavigationErrorPhase } from '../failure';
import { ViewCommitTracker } from '../view-mount/view-commit-tracker';
import type { NavigationLifecycleContext } from './types';
import type { DataSnapshot } from '../data-graph';
import type { ViewPayload } from '../view-graph';
import { canUseFastPath } from '../route-tree/can-use-fast-path';
import { rollbackUncommittedViews } from '../view-mount/view-mount-rollback';
import { NavigationFailureHandler } from './navigation-failure-handler';

/** Returns true when a newer transaction or router generation superseded this one. */
type IsTransactionStaleCheck = (transactionId: number, routerGenerationId: number) => boolean;

export class NavigationTransaction {
  readonly from: MatchedRouteInfo | null;
  readonly to: MatchedRouteInfo;
  readonly href: string;
  readonly hash: string;
  readonly action: HistoryAction;
  readonly historyOptions: NavigateHistoryOptions;
  /** When `true`, redirect walk already ran `leave` + `guard`; full pipeline skips {@link NavigationTransactionPipeline.runGuards}. */
  readonly skipBlockingPhases: boolean;

  readonly transactionId: number;
  readonly signal: AbortSignal;
  private readonly abortController: AbortController;
  readonly isStale: () => boolean;
  readonly engine: AuraRoutingEngine;

  transitionPlan!: TransitionMap;
  transitionOrder: TransitionOrderType | null = null;
  dataSnapshot?: DataSnapshot;
  /** Pre-resolved enter-branch view contents between resolve and apply (transition + atomic). */
  preResolvedBranchContents?: readonly (ViewPayload | null)[];
  viewCommitTracker: ViewCommitTracker;
  /** Set when {@link AuraRoutingEngine.commitHistoryIfNeeded} wrote the URL for this transaction. */
  historyCommitted = false;

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
    this.skipBlockingPhases = options.skipBlockingPhases ?? false;

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

  /** View success gate: `prev` + tracker (URL was written earlier in the pipeline). */
  commitNavigation(): void {
    this.engine.commitNavigation(this);
    this.viewCommitTracker.markViewCommitted();
  }

  async run(): Promise<TransactionResult> {
    this.transitionPlan = buildTransitionPlan(this.from, this.to);
    this.transitionOrder = getEnterRoute(this.transitionPlan)?.transition?.order ?? null;

    return this.runWithStagedViewRollback(() => {
      const pipeline = new NavigationTransactionPipeline(this);
      return this.transitionPlan.update
        ? pipeline.runUpdate()
        : canUseFastPath(this.transitionPlan, this.from, this.to)
          ? pipeline.runFastPipeline()
          : pipeline.runFullPipeline();
    });
  }

  /** Pre-commit blocking walk for {@link ../redirect/redirect-resolver!followRedirectsWithGuardWalk}: `leave` → `guard` via {@link NavigationTransactionPipeline.runGuards}. */
  async runRedirectCollapse(): Promise<PipelineStepResult> {
    if (!this.transitionPlan) {
      this.transitionPlan = buildTransitionPlan(this.from, this.to);
      this.transitionOrder = getEnterRoute(this.transitionPlan)?.transition?.order ?? null;
    }
    return new NavigationTransactionPipeline(this).runGuards();
  }

  async fail(
    route: MatchedRouteInfo,
    error: unknown,
    atPhase: NavigationErrorPhase,
  ): Promise<PipelineStepResult> {
    return !this.isActive()
      ? { status: 'cancelled' }
      : NavigationFailureHandler.handle(
        route,
        error,
        atPhase,
        NavigationTransaction.createTransactionContext(this),
      );
  }

  /** Builds engine orchestration context for one navigation transaction. */
  static createTransactionContext(transaction: NavigationTransaction): NavigationLifecycleContext {
    const { transactionId, signal, from, to, action, transitionPlan } = transaction;
    return {
      transaction: { from, to, action, plan: transitionPlan },
      transactionId,
      transactionSignal: signal,
      router: transaction.engine.router,
      hookRegistry: transaction.engine.hooksRegistry,
      viewCommitTracker: transaction.viewCommitTracker,
      isJobActive: () => transaction.isActive(),
      ...(transaction.dataSnapshot && { dataSnapshot: transaction.dataSnapshot }),
      reportHookError: (hookError, parent) => {
        transaction.engine.reportNavigationHookError(hookError, parent);
      },
    };
  }

  private async runWithStagedViewRollback(
    runPipeline: () => Promise<PipelineStepResult>,
  ): Promise<TransactionResult> {
    const rollbackStagedViews = () => {
      rollbackUncommittedViews(this.transitionPlan, this.viewCommitTracker);
    };

    this.signal.addEventListener('abort', rollbackStagedViews, { once: true });

    let result: PipelineStepResult | undefined;
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

  private shouldRollbackAfterRun(result: PipelineStepResult | undefined): boolean {
    if (this.viewCommitTracker.isViewCommitted()) return false;
    if (this.isAborted) return false;
    return result?.status === 'cancelled';
  }
}
