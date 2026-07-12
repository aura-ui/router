import { resolveDocumentHrefParts } from '../../../aura-utils/misc/url';
import { resolveRedirectChain } from '../redirect/redirect-resolver';
import { isSameNavigationTarget } from '../route-tree/transition-plan';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
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
  readonly generation: number;
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
  private activeTransactionId: number;
  private routerGenerationId: number;
  /** Monotonic token — latest navigation attempt wins after async resolve. */
  private navigateGeneration: number;
  /** Aborts in-flight redirect resolution when superseded. */
  private resolveAbort: AbortController | null;
  /** Open {@link navigate} attempts keyed by requested href until {@link settleNavigation}. */
  private readonly openNavigations = new Map<string, NavigationAttempt>();

  constructor(host: NavigationHost) {
    this.host = host;
    this.activeTransaction = null;
    this.activeTransactionId = 0;
    this.routerGenerationId = 0;
    this.navigateGeneration = 0;
    this.resolveAbort = null;
  }

  /**
   * Full navigation entry: resolve redirect chain, plan, then run the pipeline when needed.
   * Hash-only and anchor fast paths stay in the engine.
   */
  async navigate(
    href: string,
    action: HistoryAction,
    options: NavigateHistoryOptions,
  ): Promise<void> {
    const resolved = resolveDocumentHrefParts(href);
    const attempt = this.beginNavigation(resolved.href);
    if (attempt === null) {
      return;
    }

    try {
      const chain = await resolveRedirectChain(
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
          hash: resolved.hash,
          options,
        },
      );

      if (!this.isAttemptCurrent(attempt)) {
        return;
      }

      if (chain.status === 'redirect-error') {
        console.error(
          `[aura-router] Navigation redirect failed (${chain.code}): ${chain.href}`,
        );
        return;
      }

      if (chain.status === 'terminal') {
        this.host.finalizeResolveTerminal(chain.result, chain.probe);
        return;
      }

      if (chain.status === 'unmatched') {
        this.host.handleUnmatchedNavigation(resolved.href, action, options);
        return;
      }

      const found = chain.target;
      const slashFix = found.href !== resolved.href;
      const historyOptions: NavigateHistoryOptions = {
        ...options,
        replace: chain.replace || found.viaRedirect || slashFix || options.replace,
      };

      if (slashFix && !historyOptions.syncHistory && (action === 'system' || action === 'pop')) {
        this.host.commitPopSlashFix(found.href);
      }

      await this.run({
        from: this.host.getCommittedRoute(),
        to: found,
        action,
        href: found.href,
        hash: found.hash,
        options: historyOptions,
        completedBlockingPhases: chain.completedBlockingPhases,
      });
    } finally {
      this.settleNavigation(attempt);
    }
  }

  /** Returns true when a newer transaction or router generation superseded this one. */
  isTransactionStale(transactionId: number, routerGenerationId: number): boolean {
    return this.activeTransactionId !== transactionId || this.routerGenerationId !== routerGenerationId;
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
    this.navigateGeneration++;
    this.routerGenerationId++;
  }

  /**
   * Runs one navigation transaction after redirect resolution.
   * Also used directly in unit tests for pipeline / planning behavior.
   */
  async run(options: NavigationTransactionOptions): Promise<void> {
    const plan = this.plan(options);

    if (plan.action === 'noop') {
      return;
    }

    if (plan.action === 'cancel-pending') {
      this.activeTransaction?.cancel();
      this.activeTransaction = null;
      return;
    }

    if (this.activeTransaction) {
      this.activeTransaction.cancel();
    }

    this.activeTransactionId++;
    const transaction = new NavigationTransaction(
      this.activeTransactionId,
      this.routerGenerationId,
      options,
      this.isTransactionStale.bind(this),
      this.host.engine,
    );
    this.activeTransaction = transaction;

    try {
      const result = await transaction.run();
      this.processResult(result, transaction);
    } finally {
      if (this.activeTransaction === transaction) {
        this.activeTransaction = null;
      }
    }
  }

  isAttemptCurrent(attempt: NavigationAttempt): boolean {
    return !attempt.signal.aborted && this.navigateGeneration === attempt.generation;
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
      generation: ++this.navigateGeneration,
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

  private processResult(result: TransactionResult, transaction: NavigationTransaction): void {
    if (result.status === 'navigationSucceeded') {
      return;
    }
    if (!this.host.isRunning) {
      return;
    }

    if (result.status === 'cancelled') {
      this.host.finalizeCancelled(transaction);
      return;
    }
    if (result.status === 'redirect') {
      this.host.applyRedirect(result, transaction);
      return;
    }
    if (result.status === 'error') {
      this.host.finalizeError(result, transaction);
    }
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
