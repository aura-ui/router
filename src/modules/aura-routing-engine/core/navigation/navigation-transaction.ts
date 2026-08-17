import { AuraRoutingEngine } from '../aura-routing-engine';
import { type NavigationErrorPhase } from '../failure';
import { canUseDomCacheFastPath, canUseViewCacheFastPath } from '../route-tree/can-use-fast-path';
import { buildTransitionPlan, type TransitionMap } from '../route-tree/transition-plan';
import { ViewCommitTracker } from '../view-mount/view-commit-tracker';
import { rollbackUncommittedViews } from '../view-mount/view-mount-rollback';
import { NavigationTransactionPipeline } from './navigation-transaction-pipeline';
import { handlePipelineFailure } from './pipeline-failure';
import type { DataSnapshot } from '../data-graph';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { ViewSnapshotEntry } from '../view-graph';
import type {
  NavigationPhaseMode,
  NavigationTransactionOptions,
  PipelineStepResult,
  TransactionResult,
} from './types';
import type { NavigationLifecycleContext } from './types';

/** Returns true when a newer transaction or coordinator invalidate superseded this one. */
type IsTransactionStaleCheck = (transactionId: number) => boolean;

export class NavigationTransaction {
  readonly from: MatchedRouteInfo | null;
  readonly to: MatchedRouteInfo;
  readonly href: string;
  readonly hash: string;
  readonly action: HistoryAction;
  readonly historyOptions: NavigateHistoryOptions;
  /** When `true`, redirect walk already ran `leave` + `guard`; full pipeline skips {@link NavigationTransactionPipeline.runGuards}. */
  readonly skipBlockingPhases: boolean;
  /** See {@link NavigationTransactionOptions.phaseMode}. */
  readonly phaseMode: NavigationPhaseMode;

  readonly transactionId: number;
  readonly signal: AbortSignal;
  private readonly abortController: AbortController;
  readonly isStale: () => boolean;
  readonly engine: AuraRoutingEngine;

  transitionPlan!: TransitionMap;
  viewCommitTracker: ViewCommitTracker;
  /** Set when {@link AuraRoutingEngine.commitHistoryIfNeeded} wrote the URL for this transaction. */
  historyCommitted = false;

  dataSnapshot?: DataSnapshot;
  viewSnapshot?: readonly ViewSnapshotEntry[];

  constructor(
    transactionId: number,
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
    this.isStale = () => isTransactionStale(transactionId);
    this.engine = engine;
    this.phaseMode = options.phaseMode ?? 'navigation';

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

  /**
   * View success gate: `prev` + tracker (URL was written earlier in the pipeline).
   */
  commitNavigation(): void {
    this.engine.commitNavigation(this);
    this.viewCommitTracker.markViewCommitted();
  }

  /**
   * Build transition plan, {@link NavigationPulse.begin}, then full / update / fast pipeline.
   */
  async run(): Promise<TransactionResult> {
    this.transitionPlan = buildTransitionPlan(this.from, this.to);
    this.engine.pulse.begin(this);

    return this.runWithStagedViewRollback(() => {
      const pipeline = new NavigationTransactionPipeline(this);
      return this.transitionPlan.update
        ? pipeline.runUpdate()
        : this.transitionPlan.canUseFastPath
        || canUseDomCacheFastPath(this.transitionPlan)
        || canUseViewCacheFastPath(this.transitionPlan, this.engine.viewGraph)
          ? pipeline.runFastPipeline()
          : pipeline.runFullPipeline();
    });
  }

  /** Pre-commit blocking walk for {@link ../redirect/redirect-resolver!followRedirectsWithGuardWalk}: `leave` → `guard` via {@link NavigationTransactionPipeline.runGuards}. */
  async runRedirectCollapse(): Promise<PipelineStepResult> {
    if (!this.transitionPlan) {
      this.transitionPlan = buildTransitionPlan(this.from, this.to);
    }
    return new NavigationTransactionPipeline(this).runGuards();
  }

  async runSpeculativePrepare(): Promise<void> {
    this.transitionPlan = buildTransitionPlan(this.from, this.to);
    return new NavigationTransactionPipeline(this).runSpeculativePrepare();
  }

  async fail(
    route: MatchedRouteInfo,
    error: unknown,
    atPhase: NavigationErrorPhase,
  ): Promise<TransactionResult> {
    return !this.isActive()
      ? { status: 'cancelled' }
      : handlePipelineFailure(route, error, atPhase, NavigationTransaction.createTransactionContext(this));
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
