import { NavigationTransaction } from './navigation-transaction';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { isSameNavigationTarget } from '../route-tree/transition-plan';
import { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { TransactionFullResult } from './transaction-result';

export interface NavigationTransactionOptions {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  href: string;
  hash: string;
  options: NavigateHistoryOptions; //todo rename
}

type NavigationPlan =
  | { action: 'run' }
  | { action: 'noop'; reason: 'already-active' | 'duplicate-pending' }
  | { action: 'cancel-pending' };

export class NavigationCoordinator {
  engine: AuraRoutingEngine;

  /** Transaction the coordinator actively manages (cancel / supersede). */
  activeTransaction: NavigationTransaction | null;
  private activeTransactionId: number;
  private routerGenerationId: number;
  /**
   * Href whose navigation has not settled yet.
   * May outlive {@link activeTransaction} (e.g. cancel-pending drops the ref before finally).
   */
  inFlightHref: string | null;

  constructor(engine: AuraRoutingEngine) {
    this.activeTransaction = null;
    this.activeTransactionId = 0;
    this.routerGenerationId = 0;
    this.inFlightHref = null;
    this.engine = engine;
  }

  // call it inside active transaction after async functions to understand if it was rejected or not
  isTransactionStale(transactionId: number, routerGenerationId: number): boolean {
    return this.activeTransactionId !== transactionId || this.routerGenerationId !== routerGenerationId;
  }

  invalidate() {
    this.activeTransaction?.cancel();
    this.activeTransaction = null;
    this.inFlightHref = null;
    this.routerGenerationId++;
  }

  async run(options: NavigationTransactionOptions) {
    const { href } = options;
    const plan = this.plan(options);

    if (plan.action === 'noop') return;

    if (plan.action === 'cancel-pending') {
      this.activeTransaction?.cancel();
      this.activeTransaction = null;
      return;
    }

    if (this.activeTransaction) {
      this.activeTransaction.cancel();
    }

    this.trackInFlight(href);
    this.activeTransactionId++;
    const transaction = new NavigationTransaction(
      this.activeTransactionId,
      this.routerGenerationId,
      options,
      this.isTransactionStale.bind(this),
      this.engine,
    );
    this.activeTransaction = transaction;

    try {
      const result = await transaction.run();
      this.processResult(result, transaction);
    } finally {
      this.clearInFlight(href);
      if (this.activeTransaction === transaction) {
        this.activeTransaction = null;
      }
    }
  }

  processResult(result: TransactionFullResult, transaction: NavigationTransaction) {
    if (!result || result.status === 'navigationSucceeded') return;
    if (!this.engine.isRunning) return;

    if (result.status === 'cancelled') {
      this.engine.finalizeCancelled(transaction);
      return;
    }
    if (result?.status === 'redirect') {
      this.engine.applyRedirect(result, transaction);
      return;
    }
    if (result.status === 'error') {
      this.engine.finalizeError(result, transaction);
      return;
    }
  }

  private plan(options: NavigationTransactionOptions): NavigationPlan {
    const { from, to, href } = options;

    if (href === this.inFlightHref) {
      return { action: 'noop', reason: 'duplicate-pending' };
    }

    const sameCommittedTarget =
      from != null
      && isSameNavigationTarget(from, to)
      && !to.route.hasReenter;

    if (sameCommittedTarget) {
      if (this.inFlightHref !== null && this.inFlightHref !== href) {
        return { action: 'cancel-pending' };
      }
      return { action: 'noop', reason: 'already-active' };
    }

    return { action: 'run' };
  }

  private trackInFlight(href: string) {
    this.inFlightHref = href;
  }

  private clearInFlight(href: string) {
    if (this.inFlightHref === href) this.inFlightHref = null;
  }
}
