import {
  NavigationTransaction,
} from '../navigation-transaction/navigation-transaction';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { isSameNavigationTarget } from '../route-tree/transition-plan';
import { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { NavigationPlan } from '../navigation/navigation-planner';
import { hasReenterWork } from '../navigation/reenter-work';
import type { TransactionFullResult } from '../navigation-transaction-pipeline/navigation-transaction-pipeline';

export interface NavigationTransactionOptions {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  href: string;
  hash: string;
  options: NavigateHistoryOptions;
}

export class NavigationCoordinator {
  engine: AuraRoutingEngine;

  private currentTransaction: NavigationTransaction | null;
  private currentTransactionId: number;
  private _routerGenerationId: number;
  private pendingHref: string | null;

  constructor(engine: AuraRoutingEngine) {
    this.currentTransaction = null;
    this.currentTransactionId = 0;
    this._routerGenerationId = 0;
    this.pendingHref = null;
    this.engine = engine;
  }

  // call it inside active transaction after async functions to understand if it was rejected or not
  transactionRejected(id: number, routerGenerationId: number): boolean {
    return this.currentTransactionId !== id || this._routerGenerationId !== routerGenerationId;
  }

  invalidate() {
    this.currentTransaction?.cancel();
    this._routerGenerationId++;
  }

  async run(options: NavigationTransactionOptions) {
    const { href } = options;
    const plan = this.plan(options);

    if (plan.action === 'noop') return;

    if (plan.action === 'cancel-pending') {
      this.currentTransaction?.cancel();
      this.currentTransaction = null;
      return;
    }

    if (this.currentTransaction) {
      this.currentTransaction.cancel();
    }

    this.markPending(href);
    this.currentTransactionId++;
    const transaction = new NavigationTransaction(this.currentTransactionId, this._routerGenerationId, options, this.transactionRejected.bind(this), this.engine);
    this.currentTransaction = transaction;

    try {
      const result = await transaction.run();
      this.processResult(result, transaction);
    } finally {
      this.clearPending(href);
      if (this.currentTransaction === transaction) {
        this.currentTransaction = null;
      }
    }
  }

  processResult(result: TransactionFullResult, transaction: NavigationTransaction) {
    if (!result || result.status === 'navigationSucceeded') return;
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

    if (href === this.pendingHref) {
      return { action: 'noop', reason: 'duplicate-pending' };
    }

    const sameCommittedTarget =
      from != null
      && isSameNavigationTarget(from, to)
      && !hasReenterWork(to);

    if (sameCommittedTarget) {
      if (this.pendingHref !== null && this.pendingHref !== href) {
        return { action: 'cancel-pending' };
      }
      return { action: 'noop', reason: 'already-active' };
    }

    return { action: 'run' };
  }

  private markPending(href: string) {
    this.pendingHref = href;
  }

  private clearPending(href: string) {
    if (this.pendingHref === href) this.pendingHref = null;
  }
}
