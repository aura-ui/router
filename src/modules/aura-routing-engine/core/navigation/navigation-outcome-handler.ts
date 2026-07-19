import {
  finalizeFailure,
  type CompleteFailureDeps,
  type FailedNavigation,
} from '../failure';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { HistoryProviderLike } from '../history/history-policy';
import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  applyTransactionHistory,
  finalizePreMatchFailureNavigation,
} from './navigation-finalize';
import type { NavigationTransaction } from './navigation-transaction';
import type { TransactionResult } from './types';

/** Context for terminal apply — no bus emits ({@link NavigationPulse} is observe-only). */
export interface NavigationOutcomeApplyContext {
  provider: HistoryProviderLike;
  failureDeps: CompleteFailureDeps;
  setPrev: (prev: MatchedRouteInfo | null) => void;
  navigateTo: (
    url: string,
    action: HistoryAction,
    options: NavigateHistoryOptions,
  ) => void;
}

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
        applyTransactionHistory(
          { status: 'cancelled' },
          tx.action,
          tx.href,
          tx.from?.href ?? null,
          tx.historyOptions,
          ctx.provider,
        );
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

    case 'error': {
      const outcome = finalizeFailure(result.failure, ctx.failureDeps);
      if (shouldApplyTerminalHistoryPolicy(tx)) {
        applyTransactionHistory(
          result,
          tx.action,
          tx.href,
          tx.from?.href ?? null,
          tx.historyOptions,
          ctx.provider,
        );
      }
      if (outcome.setPrev !== undefined) {
        ctx.setPrev(outcome.setPrev);
      }
      return;
    }
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
  const effects = finalizePreMatchFailureNavigation(
    failure,
    action,
    href,
    fromHref,
    options,
    ctx.provider,
    ctx.failureDeps,
  );
  if (effects.setPrev !== undefined) {
    ctx.setPrev(effects.setPrev);
  }
}

/** Pop always; push/replace only before post-load history commit. */
function shouldApplyTerminalHistoryPolicy(tx: NavigationTransaction): boolean {
  return !tx.historyCommitted || tx.action === 'pop';
}
