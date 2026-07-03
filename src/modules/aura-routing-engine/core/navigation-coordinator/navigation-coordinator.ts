import {
  NavigationTransaction,
} from '../navigation-transaction/navigation-transaction';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { resolveHookNames } from '../lifecycle';
import { getLeafMatch } from '../route-tree/matched-chain';
import { isSameNavigationTarget } from '../route-tree/transition-plan';
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

  private currentTransactionId: number;
  private _routerGenerationId: number;
  engine: AuraRoutingEngine;

  pendingHref: string | null;

  constructor(engine: AuraRoutingEngine) {
    this.currentTransaction = null;
    this.currentTransactionId = 0;
    this._routerGenerationId = 0;
    this.engine = engine;
  }

  start() {
  }

  async run(options: NavigationTransactionOptions) {
    const { from, to, href } = options;

    console.log(to.href);

    // A1. duplicate-pending
    if (this.pendingHref === href) return;

    const sameCommitted =
      from != null
      && isSameNavigationTarget(from, to)
      && !this.routeHasReenterWork(to);

    // A2. cancel-pending — committed route, другой href in-flight
    if (sameCommitted && this.pendingHref != null && this.pendingHref !== href) {
      this.currentTransaction?.cancel();
      this.currentTransaction = null;
      return; // без новой tx, без markPending
    }

    // A3. already-active
    if (sameCommitted) return;

    // B. run — supersede
    if (this.currentTransaction) {
      this.currentTransaction.cancel();
    }
    /*

        // 1. duplicate in-flight target
        if (this.currentTransaction?.to.href === to.href) return;


        // 2. cancel superseded
        if (this.currentTransaction) {
          this.currentTransaction.cancel();
        }

        // 3. already committed, no reenter → только отмена, без нового run
        if (from && isSameNavigationTarget(from, to) && !this.routeHasReenterWork(to)) {
          console.log('the same navigation target --------- ' + isSameNavigationTarget(from, to));
          this.currentTransaction = null;
          return;
        }
    */

    this.markPending(href);
    this.currentTransactionId++;
    const transaction = new NavigationTransaction(this.currentTransactionId, this._routerGenerationId, options, this.transactionRejected.bind(this), this.engine);
    this.currentTransaction = transaction;


    console.log('run ' + this.currentTransactionId);
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
      this.clearPending(href);
      if (this.currentTransaction === transaction) {
        this.currentTransaction = null;
      }
    }
  }

  markPending(href: string) {
    this.pendingHref = href;
  }

  clearPending(href: string) {
    if (this.pendingHref === href) this.pendingHref = null;
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