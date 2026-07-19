import {
  finalizeFailure,
  type CompleteFailureDeps,
  type FailedNavigation,
} from '../failure';
import {
  applyHistoryPolicy,
  resolveHistoryPolicy,
  type HistoryProviderLike,
  type ResolveHistoryOptions,
} from '../history/history-policy';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { TransactionResult } from './types';

/** Snapshot passed to host chrome after view commit (scroll, etc.). */
export interface NavigationCommittedContext {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  hash: string;
}

/** Applies {@link resolveHistoryPolicy} for a terminal transaction result. */
export function applyTransactionHistory(
  result: TransactionResult,
  action: HistoryAction,
  href: string,
  fromHref: string | null,
  options: NavigateHistoryOptions,
  provider: HistoryProviderLike,
  policyOptions: ResolveHistoryOptions = {},
): void {
  applyHistoryPolicy(
    resolveHistoryPolicy(result, action, {
      syncHistory: options.syncHistory,
      ...policyOptions,
    }),
    { href, fromHref, options },
    provider,
  );
}

/** `prev` update for the engine after terminal navigation handling. */
export interface FinalizeNavigationEffects {
  setPrev?: MatchedRouteInfo | null;
}

/** Pre-match failure (NOT_FOUND, redirect cycle/depth): callbacks then history policy. */
export function finalizePreMatchFailureNavigation(
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
