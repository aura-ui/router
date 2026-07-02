import type { MatchedRouteInfo } from '../match/url-matcher';
import { buildTransitionPlan, type TransitionMap } from '../route-tree/transition-plan';
import { NavigationTransactionPipeline } from '../navigation-transaction-pipeline/navigation-transaction-pipeline';
import { AuraRoutingEngine } from '../aura-routing-engine';
import type { NavigationTransactionOptions } from '../navigation-coordinator/navigation-coordinator';
import type { HistoryAction } from '../history/provider.types';

type NavigationTransactionState = 'pending' | 'resolved' | 'rejected';

export interface NavigationTransactionResult {
  state: NavigationTransactionState;
  reason?: any;
}

type transactionRejectedFunc = (id: number) => boolean;

export class NavigationTransaction {
  readonly from: MatchedRouteInfo | null;
  readonly to: MatchedRouteInfo;
  readonly action: HistoryAction;

  readonly id: number;
  readonly signal: AbortSignal;
  private readonly abortController: AbortController;
  readonly transactionRejected: () => boolean;
  readonly engine: AuraRoutingEngine;
  plan: TransitionMap;

  // result: NavigationTransactionResult;
  _result: Promise<NavigationTransactionResult>;

  constructor(id: number, options: NavigationTransactionOptions, transactionRejected: transactionRejectedFunc, engine: AuraRoutingEngine) {
    this.id = id;
    this.from = options.from;
    this.to = options.to;
    this.action = options.action;
    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
    this.transactionRejected = () => transactionRejected(id);
    this.engine = engine;
    this._result = new Promise<NavigationTransactionResult>(() => {
    });
    // this.result = {
    //   state: 'pending',
    // };
  }


  get aborted(): boolean {
    return this.signal.aborted;
  }


  async run(): Promise<NavigationTransactionResult> {

    this.plan = buildTransitionPlan(this.from, this.to);

    const pipeline = new NavigationTransactionPipeline(this);

    // todo run piplie
    // create roadmap plan
    // run pipline
    return this._result;
  }

  private createRoadMap() {
  }

  cancel() {
    // todo cancel
    this.abort();
    // revert view if not commited;
  }

  private abort(reason?: unknown): void {
    if (!this.signal.aborted) {
      this.abortController.abort(reason);
      this._result = Promise.reject({ state: 'rejected', reason: 'abort-signal' });
    }
  }

}