import {
  NavigationTransaction,
  type NavigationTransactionResult,
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
  lastTransaction: NavigationTransaction | null;

  private currentTransactionId: number;
  private _routerGenerationId: number;
  engine: AuraRoutingEngine;

  constructor(engine: AuraRoutingEngine) {
    this.currentTransaction = null;
    this.currentTransactionId = 0;
    this.engine = engine;
  }

  start() {
  }

  async run(options: NavigationTransactionOptions) {
    const {from, to, action} = options;
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
    const transaction = new NavigationTransaction(this.currentTransactionId, options, this.transactionRejected, this.engine);
    this.currentTransaction = transaction;
    transaction.run()
      .then((result: NavigationTransactionResult) => {
        //todo update history
        // this.lastTransaction = transaction;
      }).catch((result: NavigationTransactionResult) => {
      //
    }).finally(() => {
      if (this.currentTransaction === transaction) {
        this.currentTransaction = null;
      }
    });
  }

  private routeHasReenterWork(to: MatchedRouteInfo): boolean {
    const hooks = resolveHookNames(getLeafMatch(to).route, 'reenter');
    return !!hooks?.length;
  }

  // call it inside active transaction after async functions to understand if it was rejected or not
  transactionRejected(id: number): boolean {
    return this.currentTransactionId !== id; // todo add also render generation
  }

  //check duplicates
  //begin new - pass new id and generatio
}