import {
  NavigationTransaction,
} from '../navigation-transaction/navigation-transaction';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { resolveHookNames } from '../lifecycle';
import { getLeafMatch } from '../route-tree/matched-chain';
import { isSameNavigationTarget, type TransitionMap } from '../route-tree/transition-plan';
import { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';


export interface NavigationTransactionOptions {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  href: string;
  hash: string;
  options: NavigateHistoryOptions;
}

export class NavigationCoordinator {
  currentTransaction: NavigationTransaction | null;
  lastTransaction: NavigationTransaction | null;

  private currentTransactionId: number;
  private _routerGenerationId: number;
  engine: AuraRoutingEngine;

  constructor(engine: AuraRoutingEngine) {
    this.currentTransaction = null;
    this.currentTransactionId = 0;
    this._routerGenerationId = 0;
    this.engine = engine;
  }

  start() {
  }

  async run(options: NavigationTransactionOptions) {
    const { from, to } = options;
    // 1. duplicate in-flight target
    if (this.currentTransaction?.to.href === to.href) return;

    // 2. cancel superseded
    if (this.currentTransaction) {
      this.currentTransaction.cancel();
    }

    // 3. already committed, no reenter → только отмена, без нового run
    if (from && isSameNavigationTarget(from, to) && !this.routeHasReenterWork(to)) {
      this.currentTransaction = null;
      return;
    }

    this.currentTransactionId++;
    const transaction = new NavigationTransaction(this.currentTransactionId, this._routerGenerationId, options, this.transactionRejected.bind(this), this.engine);
    this.currentTransaction = transaction;

    try {
      const result = await transaction.run();
      if (!result || result.status === 'navigationSucceeded') return;
      if (result.status === 'cancelled') {
        this.engine.finalizeCancelled(transaction);
        return; // supersede — тихо
      }
      if (result?.status === 'redirect') {
        this.engine.applyRedirect(result, transaction);
        return;
      }
      if (result.status === 'error') {
        this.engine.finalizeError(result, transaction); // или finalizeNavigation
        return;
      }

      //todo
      // this.lastTransaction = transaction;

    } //catch (error) {
      // (result: TransactionFullResult) => {
      // сработает только при throw
      // }
    //}
    finally {
      if (this.currentTransaction === transaction) {
        this.currentTransaction = null;
      }
    }
  }

  private routeHasReenterWork(to: MatchedRouteInfo): boolean {
    const hooks = resolveHookNames(getLeafMatch(to).route, 'reenter');
    return !!hooks?.length;
  }

  // call it inside active transaction after async functions to understand if it was rejected or not
  transactionRejected(id: number, routerGenerationId: number): boolean {
    return this.currentTransactionId !== id || this._routerGenerationId !== routerGenerationId;
  }

  invalidate() {
    this.currentTransaction?.cancel();
    this._routerGenerationId++;
  }

  //check duplicates
  //begin new - pass new id and generatio
}