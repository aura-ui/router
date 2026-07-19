import type { NavigationFailure } from '../failure';
import {
  applyTransactionHistory,
  type HistoryProviderLike,
} from '../history/history-policy';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from './navigation-transaction';
import type { TransactionResult } from './types';

/**
 * Host callbacks / provider for terminal apply.
 * No bus emits — {@link NavigationPulse} is observe-only.
 */
export type ApplyOutcomeContext = {
  provider: HistoryProviderLike;
  onNotFound?: (failure: NavigationFailure) => void | boolean;
  notFoundHandler?: (href: string) => void;
  setPrev: (prev: MatchedRouteInfo | null) => void;
  navigateTo: (
    url: string,
    action: HistoryAction,
    options: NavigateHistoryOptions,
  ) => void;
};

/** NOT_FOUND recovery callbacks (public config shape). */
export type NotFoundCallbacks = Pick<
  ApplyOutcomeContext,
  'onNotFound' | 'notFoundHandler'
>;

/** @deprecated Use {@link NotFoundCallbacks}. */
export type CompleteFailureDeps = NotFoundCallbacks;

/**
 * Who/where of the navigation being applied — enough for history + redirect
 * without a live {@link NavigationTransaction} (pre-match uses ad-hoc fields).
 */
export type NavigationIdentity = {
  action: HistoryAction;
  href: string;
  fromHref: string | null;
  historyOptions: NavigateHistoryOptions;
  /** Omit / false for pre-match (URL not written yet). */
  historyCommitted?: boolean;
};

/** {@link NavigationIdentity} from a live transaction. */
export function navigationIdentityFromTx(
  tx: NavigationTransaction,
): NavigationIdentity {
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
  identity: NavigationIdentity,
  ctx: ApplyOutcomeContext,
): void {
  switch (result.status) {
    case 'navigationSucceeded':
      return;

    case 'cancelled':
      applyHistoryIfNeeded({ status: 'cancelled' }, identity, ctx.provider);
      return;

    case 'redirect': {
      const replace =
        result.replace ?? (!!identity.historyCommitted || identity.action === 'pop');
      ctx.navigateTo(result.url, replace ? 'replace' : 'push', {
        replace,
        syncHistory: true,
      });
      return;
    }

    case 'error':
      applyFailureEffects(result.failure, ctx);
      applyHistoryIfNeeded(result, identity, ctx.provider);
      return;
  }
}

/** NOT_FOUND callbacks + `prev`. No history / bus. */
function applyFailureEffects(
  failure: NavigationFailure,
  ctx: ApplyOutcomeContext,
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
  identity: NavigationIdentity,
  provider: HistoryProviderLike,
): void {
  if (identity.historyCommitted && identity.action !== 'pop') {
    return;
  }
  applyTransactionHistory(
    result,
    identity.action,
    identity.href,
    identity.fromHref,
    identity.historyOptions,
    provider,
  );
}
