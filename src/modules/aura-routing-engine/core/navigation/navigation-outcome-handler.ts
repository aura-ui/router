import type { FailedNavigation } from '../failure';
import {
  applyTransactionHistory,
  type HistoryProviderLike,
} from '../history/history-policy';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from './navigation-transaction';
import type { TransactionResult } from './types';

/** Context for terminal apply — no bus emits ({@link NavigationPulse} is observe-only). */
export type NavigationOutcomeApplyContext = {
  provider: HistoryProviderLike;
  onNotFound?: (failure: FailedNavigation) => void | boolean;
  notFoundHandler?: (href: string) => void;
  setPrev: (prev: MatchedRouteInfo | null) => void;
  navigateTo: (
    url: string,
    action: HistoryAction,
    options: NavigateHistoryOptions,
  ) => void;
};

/** Public config shape for NOT_FOUND recovery (subset of apply context). */
export type CompleteFailureDeps = Pick<
  NavigationOutcomeApplyContext,
  'onNotFound' | 'notFoundHandler'
>;

/**
 * History identity for terminal apply — from a live {@link NavigationTransaction}
 * or ad-hoc fields for pre-match failures (no tx).
 */
export type OutcomeNav = {
  action: HistoryAction;
  href: string;
  fromHref: string | null;
  historyOptions: NavigateHistoryOptions;
  /** Omit / false for pre-match. */
  historyCommitted?: boolean;
};

/** Build {@link OutcomeNav} from a transaction. */
export function outcomeNavFromTx(tx: NavigationTransaction): OutcomeNav {
  return {
    action: tx.action,
    href: tx.href,
    fromHref: tx.from?.href ?? null,
    historyOptions: tx.historyOptions,
    historyCommitted: tx.historyCommitted,
  };
}

/**
 * Apply terminal side effects for a {@link TransactionResult}.
 * Call after {@link NavigationPulse.settle}. `navigationSucceeded` is a no-op.
 */
export function applyNavigationOutcome(
  result: TransactionResult,
  nav: OutcomeNav,
  ctx: NavigationOutcomeApplyContext,
): void {
  switch (result.status) {
    case 'navigationSucceeded':
      return;

    case 'cancelled':
      applyHistoryIfNeeded({ status: 'cancelled' }, nav, ctx.provider);
      return;

    case 'redirect': {
      const replace = result.replace ?? (!!nav.historyCommitted || nav.action === 'pop');
      ctx.navigateTo(result.url, replace ? 'replace' : 'push', {
        replace,
        syncHistory: true,
      });
      return;
    }

    case 'error':
      applyFailureEffects(result.failure, ctx);
      applyHistoryIfNeeded(result, nav, ctx.provider);
      return;
  }
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

/** Pop always; push/replace only before post-load history commit. */
function applyHistoryIfNeeded(
  result: TransactionResult,
  nav: OutcomeNav,
  provider: HistoryProviderLike,
): void {
  if (nav.historyCommitted && nav.action !== 'pop') {
    return;
  }
  applyTransactionHistory(
    result,
    nav.action,
    nav.href,
    nav.fromHref,
    nav.historyOptions,
    provider,
  );
}
