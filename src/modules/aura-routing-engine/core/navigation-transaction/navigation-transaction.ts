import type { MatchedRouteInfo } from '../match/url-matcher';
import { buildTransitionPlan } from '../route-tree/transition-plan';

type NavigationTransactionState = 'pending' | 'resolved' | 'rejected';

export interface NavigationTransactionResult {
  state: NavigationTransactionState;
  reason?: any;
}

type transactionRejectedFunc = (id: number) => {};

export class NavigationTransaction {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;

  readonly id: number;
  readonly signal: AbortSignal;
  private readonly abortController: AbortController;
  private transactionRejected: transactionRejectedFunc;

  // result: NavigationTransactionResult;
  _result: Promise<NavigationTransactionResult>;

  constructor(id: number, from: MatchedRouteInfo | null, to: MatchedRouteInfo, transactionRejected: transactionRejectedFunc) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
    this.transactionRejected = transactionRejected;
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

    const transitionPlan = buildTransitionPlan(this.from, this.to);

    // todo run piplie
    // create roadmap plan
    // run pipline
    return this._result;
  }

  private createRoadMap(){}

  cancel() {
    // todo cancel
    this.abort();
   // revert view if not commited;
  }

  private abort(reason?: unknown): void {
    if (!this.signal.aborted) {
      this._result = Promise.reject({ state: 'rejected', reason: 'abort-signal' });
      this.abortController.abort(reason);
    }
  }

}