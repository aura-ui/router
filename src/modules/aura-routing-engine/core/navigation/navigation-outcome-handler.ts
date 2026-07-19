import type { FailedNavigation } from '../failure';
import {
  applyTransactionHistory,
  type HistoryProviderLike,
} from '../history/history-policy';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from './navigation-transaction';
import type { TransactionResult } from './types';

/** App recovery callbacks for NOT_FOUND (public config shape). */
export type CompleteFailureDeps = {
  onNotFound?: (failure: FailedNavigation) => void | boolean;
  notFoundHandler?: (href: string) => void;
};

/** Context for terminal apply — no bus emits ({@link NavigationPulse} is observe-only). */
export type NavigationOutcomeApplyContext = CompleteFailureDeps & {
  provider: HistoryProviderLike;
  setPrev: (prev: MatchedRouteInfo | null) => void;
  navigateTo: (
    url: string,
    action: HistoryAction,
    options: NavigateHistoryOptions,
  ) => void;
};

/**
 * Apply terminal side effects for a {@link TransactionResult}.
 * Call after {@link NavigationPulse.settle}. `navigationSucceeded` is a no-op.
 */
export function applyNavigationOutcome(
  result: TransactionResult,
  tx: NavigationTransaction,
  ctx: NavigationOutcomeApplyContext,
): void {
  switch (result.status) {
    case 'navigationSucceeded':
      return;

    case 'cancelled':
      if (shouldApplyTerminalHistoryPolicy(tx)) {
        writeTxHistory({ status: 'cancelled' }, tx, ctx.provider);
      }
      return;

    case 'redirect': {
      const replace = result.replace ?? (tx.historyCommitted || tx.action === 'pop');
      ctx.navigateTo(result.url, replace ? 'replace' : 'push', {
        replace,
        syncHistory: true,
      });
      return;
    }

    case 'error':
      applyFailureEffects(result.failure, ctx);
      if (shouldApplyTerminalHistoryPolicy(tx)) {
        writeTxHistory(result, tx, ctx.provider);
      }
      return;
  }
}

/** Pre-match failure (NOT_FOUND, redirect cycle/depth): callbacks + history + `prev`. */
export function applyPreMatchFailure(
  failure: FailedNavigation,
  action: HistoryAction,
  href: string,
  fromHref: string | null,
  options: NavigateHistoryOptions,
  ctx: NavigationOutcomeApplyContext,
): void {
  applyFailureEffects(failure, ctx);
  applyTransactionHistory(
    failure.toResult(),
    action,
    href,
    fromHref,
    options,
    ctx.provider,
  );
}

/** NOT_FOUND callbacks + `prev`. No history / bus. */
function applyFailureEffects(
  failure: FailedNavigation,
  ctx: NavigationOutcomeApplyContext,
): void {
  if (failure.isNotFound) {
    if (ctx.onNotFound?.(failure) !== false) {
      ctx.notFoundHandler?.(failure.href);
    }
    ctx.setPrev(null);
    return;
  }

  if (failure.viewCommitted) {
    ctx.setPrev(failure.to);
  }
}

function writeTxHistory(
  result: TransactionResult,
  tx: NavigationTransaction,
  provider: HistoryProviderLike,
): void {
  applyTransactionHistory(
    result,
    tx.action,
    tx.href,
    tx.from?.href ?? null,
    tx.historyOptions,
    provider,
  );
}

/** Pop always; push/replace only before post-load history commit. */
function shouldApplyTerminalHistoryPolicy(tx: NavigationTransaction): boolean {
  return !tx.historyCommitted || tx.action === 'pop';
}
