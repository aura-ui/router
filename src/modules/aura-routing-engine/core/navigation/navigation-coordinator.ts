import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import { resolveDocumentHrefParts } from '../link-active/app-href';
import { followRedirectsWithGuardWalk } from '../redirect/redirect-resolver';
import { isSameNavigationTarget } from '../route-tree/transition-plan';

import type { NavigationHost } from './navigation-host';
import { NavigationTransaction } from './navigation-transaction';
import type { NavigationTransactionOptions, TransactionResult } from './types';

type NavigationPlan =
  | { action: 'run' }
  | { action: 'noop'; reason: 'already-active' }
  | { action: 'cancel-pending' };

/** Handle for one open {@link NavigationCoordinator.navigate} attempt. */
export type NavigationAttempt = {
  readonly href: string;
  readonly id: number;
  readonly signal: AbortSignal;
};

/**
 * Orchestrates navigation attempts: dedupe, redirect resolution, planning, and pipeline runs.
 * Concurrency state for overlapping attempts lives here; the engine owns committed route state.
 */
export class NavigationCoordinator {
  private readonly host: NavigationHost;

  /** Transaction the coordinator actively manages (cancel / supersede). */
  activeTransaction: NavigationTransaction | null;
  /**
   * Pipeline epoch: bumped on each {@link run} and on {@link invalidate}.
   * A transaction is current only while its id equals this value (supersede + invalidate fence).
   */
  private activeTransactionId: number;
  /**
   * Current navigation-attempt id — latest attempt wins after async resolve.
   * Paired with {@link NavigationAttempt.id} (same role as {@link activeTransactionId} for pipeline txs).
   */
  private activeNavigationAttemptId: number;
  /** Aborts in-flight redirect resolution when superseded. */
  private resolveAbort: AbortController | null;
  /** Open {@link navigate} attempts keyed by requested href until {@link settleNavigation}. */
  private readonly openNavigations = new Map<string, NavigationAttempt>();

  constructor(host: NavigationHost) {
    this.host = host;
    this.activeTransaction = null;
    this.activeTransactionId = 0;
    this.activeNavigationAttemptId = 0;
    this.resolveAbort = null;
  }

  /**
   * Full navigation entry: resolve redirect chain, plan, then run the pipeline when needed.
   * Hash-only and anchor fast paths stay in the engine.
   */
  async navigate(href: string, action: HistoryAction, options: NavigateHistoryOptions): Promise<void> {
    const resolved = resolveDocumentHrefParts(href);
    const attempt = this.beginNavigation(resolved.href);
    if (attempt === null) {
      return;
    }

    try {
      const chain = await followRedirectsWithGuardWalk(
        {
          engine: this.host.engine,
          matcher: this.host.matcher,
          getMatchableNodes: () => this.host.getMatchableNodes(),
          isActive: () => this.isAttemptCurrent(attempt),
        },
        {
          href: resolved,
          from: this.host.getCommittedRoute(),
          action,
          options,
        },
      );

      if (!this.isAttemptCurrent(attempt)) {
        return;
      }

      // Non-resolved outcomes skip {@link run} — drop any in-flight pipeline (same as cancel-pending).
      if (chain.status !== 'resolved') {
        this.activeTransaction?.cancel();
        this.activeTransaction = null;
      }

      if (chain.status === 'redirect-error') {
        this.host.handleRedirectError(chain.code, chain.href, action, options);
        return;
      }

      if (chain.status === 'terminal') {
        this.host.finalizeResolveTerminal(chain.result, chain.probe);
        return;
      }

      if (chain.status === 'unmatched') {
        this.host.handleUnmatchedNavigation(chain.href, action, options);
        return;
      }

      const found = chain.target;
      const historyOptions: NavigateHistoryOptions = {
        ...options,
        replace: chain.replace || found.viaRedirect || options.replace,
      };

      await this.run({
        from: this.host.getCommittedRoute(),
        to: found,
        action,
        href: found.href,
        hash: found.hash,
        options: historyOptions,
        skipBlockingPhases: chain.skipBlockingPhases,
      });
    } finally {
      this.settleNavigation(attempt);
    }
  }

  /** Returns true when a newer transaction or {@link invalidate} superseded this one. */
  isTransactionStale(transactionId: number): boolean {
    return this.activeTransactionId !== transactionId;
  }

  /** Whether a navigation attempt for this href is still open. */
  hasOpenNavigation(href: string): boolean {
    return this.openNavigations.has(href);
  }

  invalidate(): void {
    this.activeTransaction?.cancel();
    this.activeTransaction = null;
    this.resolveAbort?.abort();
    this.resolveAbort = null;
    this.openNavigations.clear();
    this.activeNavigationAttemptId++;
    // Fence: completed/leftover txs (id still equals last run) become stale without a new run.
    this.activeTransactionId++;
  }

  /**
   * Runs one navigation transaction after redirect resolution.
   * Also used directly in unit tests for pipeline / planning behavior.
   */
  async run(options: NavigationTransactionOptions): Promise<void> {
    const plan = this.plan(options);

    if (plan.action === 'noop') {
      if (options.action === 'push' || options.action === 'replace') {
        this.host.engine.handleSameUrlNavigation(options.to, options.hash);
      }
      return;
    }

    if (plan.action === 'cancel-pending') {
      const pending = this.activeTransaction;
      pending?.cancel();
      this.activeTransaction = null;
      this.host.restoreCommittedNavState(pending);
      return;
    }

    this.activeTransactionId++;
    const next = new NavigationTransaction(
      this.activeTransactionId,
      options,
      this.isTransactionStale.bind(this),
      this.host.engine,
    );

    const resources = this.host.engine.resourceGraph;

    // Supersede only: pin B’s keys before cancel(A); unpin in finally (`'pin'` kind).
    // Skip when no active tx. See ResourceGraph.pinSharedBufferFor / HandoffWaiterKind.
    const sharedBufferHold = this.activeTransaction
      ? resources.pinSharedBufferFor(options.to)
      : null;

    if (this.activeTransaction) {
      this.activeTransaction.cancel();
    }

    this.activeTransaction = next;

    try {
      const result = await next.run();
      this.processResult(result, next);
    } finally {
      sharedBufferHold?.unpin();
      if (this.activeTransaction === next) {
        this.activeTransaction = null;
      }
    }
  }

  isAttemptCurrent(attempt: NavigationAttempt): boolean {
    return !attempt.signal.aborted && this.activeNavigationAttemptId === attempt.id;
  }

  /** Registers one open navigation attempt; used by {@link navigate} and integration tests. */
  beginNavigation(href: string): NavigationAttempt | null {
    if (this.openNavigations.has(href)) {
      return null;
    }

    this.resolveAbort?.abort();
    this.resolveAbort = new AbortController();

    const attempt: NavigationAttempt = {
      href,
      id: ++this.activeNavigationAttemptId,
      signal: this.resolveAbort.signal,
    };
    this.openNavigations.set(href, attempt);
    return attempt;
  }

  /** Releases one open navigation attempt after {@link navigate} or test harness settles. */
  settleNavigation(attempt: NavigationAttempt): void {
    if (this.openNavigations.get(attempt.href) === attempt) {
      this.openNavigations.delete(attempt.href);
    }
  }

  /** Observe ({@link NavigationPulse.settle}), then apply terminal side effects. */
  private processResult(result: TransactionResult, transaction: NavigationTransaction): void {
    this.host.engine.pulse.settle(transaction.transactionId, result);
    if (!this.host.isRunning) return;
    this.host.applyTerminalOutcome(result, transaction);
  }

  private plan(options: NavigationTransactionOptions): NavigationPlan {
    const { from, to, href } = options;

    const sameCommittedTarget = from != null && isSameNavigationTarget(from, to);

    if (!sameCommittedTarget) {
      return { action: 'run' };
    }

    const conflictingHref = this.getConflictingPendingHref(href);
    if (conflictingHref !== null) {
      return { action: 'cancel-pending' };
    }

    return { action: 'noop', reason: 'already-active' };
  }

  /** Another href is still resolving or its pipeline has not settled yet. */
  private getConflictingPendingHref(excludingHref: string): string | null {
    if (this.activeTransaction !== null && this.activeTransaction.href !== excludingHref) {
      return this.activeTransaction.href;
    }

    for (const openHref of this.openNavigations.keys()) {
      if (openHref !== excludingHref) {
        return openHref;
      }
    }

    return null;
  }
}
