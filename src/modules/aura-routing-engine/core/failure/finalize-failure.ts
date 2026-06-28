import type { MatchedRouteInfo } from '../match/url-matcher';
import type { FailedNavigation } from './navigation-failure';

export interface CompleteFailureDeps {
  onNavigationError?: (failure: FailedNavigation) => void;
  onNotFound?: (failure: FailedNavigation) => void | boolean;
  notFoundHandler?: (href: string) => void;
}

export interface CompleteFailureOutcome {
  /** When set, engine assigns `prev`; when omitted, `prev` is unchanged. */
  setPrev?: MatchedRouteInfo | null;
}

/** Failure callbacks and `prev` hint — history is applied by the engine via {@link ../history/history-policy}. */
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

  if (failure.isNotFound) {
    return { setPrev: null };
  }

  return failure.viewCommitted ? { setPrev: failure.to } : {};
}
