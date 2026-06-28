import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import {
  applyHistoryPolicy,
  resolveHistoryPolicy,
  type HistoryProviderLike,
} from '../history/history-policy';
import type { MatchedRouteInfo } from '../match/url-matcher';
import {
  finalizeFailure,
  type CompleteFailureDeps,
} from '../failure/finalize-failure';
import type { FailedNavigation } from '../failure/navigation-failure';
import type { TransactionResult } from './transaction-result';

/** Applies {@link resolveHistoryPolicy} for a processor or failure transaction result. */
export function applyTransactionHistory(
  result: TransactionResult,
  action: HistoryAction,
  href: string,
  fromHref: string | null,
  options: NavigateHistoryOptions,
  provider: HistoryProviderLike,
): void {
  applyHistoryPolicy(
    resolveHistoryPolicy(result, action, { syncHistory: options.syncHistory }),
    { href, fromHref, options },
    provider,
  );
}

export interface FinalizeNavigationContext {
  action: HistoryAction;
  href: string;
  options: NavigateHistoryOptions;
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  hash: string;
}

export interface FinalizeNavigationCallbacks {
  failureDeps: CompleteFailureDeps;
  onNavigationCommitted?: (to: MatchedRouteInfo) => void;
  onRedirect: (url: string, replace: boolean) => void;
  scrollToHash?: (hash: string) => void;
}

/** `prev` update for the engine after terminal navigation handling. */
export interface FinalizeNavigationEffects {
  setPrev?: MatchedRouteInfo | null;
}

/**
 * Terminal processor outcome: history policy, failure callbacks, redirect, and `prev` hint.
 *
 * Every terminal status uses {@link applyTransactionHistory} except `redirect`.
 */
export function finalizeProcessorNavigation(
  result: TransactionResult,
  ctx: FinalizeNavigationContext,
  provider: HistoryProviderLike,
  callbacks: FinalizeNavigationCallbacks,
): FinalizeNavigationEffects {
  const fromHref = ctx.from?.href ?? null;

  switch (result.status) {
    case 'viewCommitted':
      applyTransactionHistory(result, ctx.action, ctx.href, fromHref, ctx.options, provider);
      callbacks.onNavigationCommitted?.(ctx.to);
      if (ctx.hash) callbacks.scrollToHash?.(ctx.hash);
      return { setPrev: ctx.to };

    case 'cancelled':
      applyTransactionHistory(result, ctx.action, ctx.href, fromHref, ctx.options, provider);
      return {};

    case 'error': {
      const failureOutcome = finalizeFailure(result.failure, callbacks.failureDeps);
      applyTransactionHistory(result, ctx.action, ctx.href, fromHref, ctx.options, provider);
      return failureOutcome.setPrev !== undefined ? { setPrev: failureOutcome.setPrev } : {};
    }

    case 'redirect': {
      const replace = result.replace ?? ctx.action === 'pop';
      callbacks.onRedirect(result.url, replace);
      return {};
    }
  }
}

/** Pre-match NOT_FOUND: failure callbacks then history policy. */
export function finalizeNotFoundNavigation(
  failure: FailedNavigation,
  action: HistoryAction,
  href: string,
  fromHref: string | null,
  options: NavigateHistoryOptions,
  provider: HistoryProviderLike,
  failureDeps: CompleteFailureDeps,
): FinalizeNavigationEffects {
  const outcome = finalizeFailure(failure, failureDeps);
  applyTransactionHistory(failure.toResult(), action, href, fromHref, options, provider);
  return outcome.setPrev !== undefined ? { setPrev: outcome.setPrev } : {};
}
