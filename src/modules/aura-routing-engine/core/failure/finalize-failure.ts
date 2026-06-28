import type { NavigateHistoryOptions } from '../history/provider.types';
import {
  applyHistoryPolicy,
  resolveErrorHistoryPolicy,
  type HistoryProviderLike,
} from '../history/history-policy';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { FailedNavigation } from './navigation-failure';

export interface CompleteFailureDeps {
  options: NavigateHistoryOptions;
  provider: HistoryProviderLike;
  onNavigationError?: (failure: FailedNavigation) => void;
  onNotFound?: (failure: FailedNavigation) => void | boolean;
  notFoundHandler?: (href: string) => void;
}

export interface CompleteFailureOutcome {
  /** When set, engine assigns `prev`; when omitted, `prev` is unchanged. */
  setPrev?: MatchedRouteInfo | null;
}

/** Callbacks → history policy → `prev` hint for a terminal navigation failure. */
export function finalizeFailure(
  failure: FailedNavigation,
  deps: CompleteFailureDeps,
): CompleteFailureOutcome {
  if (failure.isNotFound) {
    const recoveryAllowed = deps.onNotFound?.(failure) !== false;
    if (recoveryAllowed) {
      deps.notFoundHandler?.(failure.href);
    }
  } else {
    deps.onNavigationError?.(failure);
  }

  applyHistoryPolicy(
    resolveErrorHistoryPolicy(failure.error.code, failure.commit, failure.action, {
      syncHistory: deps.options.syncHistory,
    }),
    {
      href: failure.href,
      fromHref: failure.from?.href ?? null,
      options: deps.options,
    },
    deps.provider,
  );

  if (failure.isNotFound) {
    return { setPrev: null };
  }

  return failure.viewCommitted ? { setPrev: failure.to } : {};
}
