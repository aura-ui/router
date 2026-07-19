import type { EventBus } from '../events';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from './navigation-transaction';
import type { PipelineStepResult, TransactionResult } from './types';

/**
 * **Observe-only** facade over {@link EventBus}: navigation / load lifecycle emits.
 *
 * Contract (do not break):
 * - **Does:** `bus.emit(...)` with a stable payload shape.
 * - **Does not:** write history, mutate `prev`, call app callbacks (`onNotFound`, …),
 *   start a new navigation, mount/unmount views, or otherwise apply engine side effects.
 *
 * Terminal side effects live in {@link ./navigation-outcome!applyNavigationOutcome}.
 * Call order target: {@link settle} (observe) → apply effects (mutate).
 *
 * Flow: {@link begin} → {@link prepareStart}/{@link prepareEnd} → {@link loadStart}/{@link loadEnd}
 * → {@link alignUrl} → {@link commitStart}/{@link commitEnd} → {@link settle}.
 *
 * @see docs/done/EVENT_BUS.md
 * @see docs/todo/NAVIGATION_RUN_MANAGER.md (cleanup phases)
 */
export class NavigationPulse {
  private readonly bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  /** Emits `navigation:start` + `node:deactivate` for exit routes. */
  begin(tx: NavigationTransaction): void {
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

  /** Emits `navigation:prepare:start`. */
  prepareStart(tx: NavigationTransaction): void {
    this.bus.emit({ type: 'navigation:prepare:start', id: tx.transactionId });
  }

  /** Emits `navigation:prepare:end`. */
  prepareEnd(tx: NavigationTransaction): void {
    this.bus.emit({ type: 'navigation:prepare:end', id: tx.transactionId });
  }

  /** Emits `load:start` per route. */
  loadStart(tx: NavigationTransaction, routes: readonly MatchedRouteInfo[]): void {
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

  /**
   * After `resourceGraph.load`: emits `load:end` on success, `load:error` when
   * `error.status === 'error'`; no-op when cancelled / other non-error status.
   */
  loadEnd(
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
   * Emits `navigation:url-aligned` when the address bar already matches the target
   * (`historyCommitted` write, or `system` / `pop`). Otherwise no-op.
   */
  alignUrl(tx: NavigationTransaction): void {
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

  /** Emits `navigation:commit:start`. */
  commitStart(tx: NavigationTransaction): void {
    this.bus.emit({ type: 'navigation:commit:start', id: tx.transactionId });
  }

  /** Emits `navigation:commit:end` + `node:activate` for enter routes. */
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

  /**
   * Terminal **observe** hook: maps {@link TransactionResult} to bus events only
   * (`navigation:finish` | `cancel` | `redirect` | `error`). No history / `prev` / callbacks.
   *
   * Callers apply engine side effects separately (after or around this emit).
   */
  settle(id: number, result: TransactionResult): void {
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
