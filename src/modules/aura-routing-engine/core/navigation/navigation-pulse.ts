import type { EventBus } from '../events';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from './navigation-transaction';
import type { PipelineStepResult, TransactionResult } from './types';

/**
 * Single place for navigation / load bus emits.
 * Pipeline and coordinator call short methods; payload shape lives here only.
 *
 * @see docs/todo/EVENT_BUS.md
 */
export class NavigationPulse {
  private readonly bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  /** `navigation:start` + `node:deactivate` for exit routes. */
  start(tx: NavigationTransaction): void {
    const id = tx.transactionId;
    this.bus.emit({
      type: 'navigation:start',
      id,
      from: tx.from,
      to: tx.to,
      action: tx.action,
    });
    for (const route of tx.transitionPlan.exitRoutes) {
      this.bus.emit({
        type: 'node:deactivate',
        id,
        nodeId: route.pattern,
        pattern: route.pattern,
      });
    }
  }

  prepareStart(tx: NavigationTransaction): void {
    this.bus.emit({ type: 'navigation:prepare:start', id: tx.transactionId });
  }

  prepareEnd(tx: NavigationTransaction): void {
    this.bus.emit({ type: 'navigation:prepare:end', id: tx.transactionId });
  }

  loadBegin(tx: NavigationTransaction, routes: readonly MatchedRouteInfo[]): void {
    const id = tx.transactionId;
    for (const route of routes) {
      this.bus.emit({
        type: 'load:start',
        id,
        nodeId: route.pattern,
        pattern: route.pattern,
      });
    }
  }

  /** After `resourceGraph.load`: `load:end*` or `load:error` (error status only). */
  loadSettle(
    tx: NavigationTransaction,
    routes: readonly MatchedRouteInfo[],
    error: PipelineStepResult | undefined,
    fallbackTo: MatchedRouteInfo,
  ): void {
    const id = tx.transactionId;
    if (error) {
      if (error.status === 'error') {
        const failed = error.failure.to ?? fallbackTo;
        this.bus.emit({
          type: 'load:error',
          id,
          nodeId: failed.pattern,
          pattern: failed.pattern,
          error: error.failure.error,
        });
      }
      return;
    }
    for (const route of routes) {
      this.bus.emit({
        type: 'load:end',
        id,
        nodeId: route.pattern,
        pattern: route.pattern,
      });
    }
  }

  /**
   * `navigation:url-aligned` when the address bar already matches the target
   * (`historyCommitted` write, or `system` / `pop`).
   */
  urlAligned(tx: NavigationTransaction): void {
    const { from, to, action, hash, historyCommitted, transactionId } = tx;
    if (!historyCommitted && action !== 'system' && action !== 'pop') return;

    this.bus.emit({
      type: 'navigation:url-aligned',
      id: transactionId,
      from,
      to,
      action,
      hash,
      source: historyCommitted ? 'write' : 'browser',
    });
  }

  commitStart(tx: NavigationTransaction): void {
    this.bus.emit({ type: 'navigation:commit:start', id: tx.transactionId });
  }

  /** `navigation:commit:end` + `node:activate` for enter routes. */
  commitEnd(tx: NavigationTransaction): void {
    const { from, to, action, hash, transactionId, transitionPlan } = tx;
    this.bus.emit({
      type: 'navigation:commit:end',
      id: transactionId,
      from,
      to,
      action,
      hash,
    });
    for (const route of transitionPlan?.enterRoutes ?? []) {
      this.bus.emit({
        type: 'node:activate',
        id: transactionId,
        nodeId: route.pattern,
        pattern: route.pattern,
      });
    }
  }

  /** Terminal outcome after pipeline / redirect-walk settle. */
  terminal(id: number, result: TransactionResult): void {
    switch (result.status) {
      case 'navigationSucceeded':
        this.bus.emit({ type: 'navigation:finish', id });
        return;
      case 'cancelled':
        this.bus.emit({ type: 'navigation:cancel', id });
        return;
      case 'redirect':
        this.bus.emit({
          type: 'navigation:redirect',
          id,
          url: result.url,
          replace: result.replace ?? false,
        });
        return;
      case 'error':
        this.bus.emit({ type: 'navigation:error', id, failure: result.failure });
    }
  }
}
