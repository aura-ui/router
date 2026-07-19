import type { MatchedRouteInfo } from '../match/url-matcher';
import type { FailedNavigation } from './navigation-failure';

export interface CompleteFailureDeps {
  onNotFound?: (failure: FailedNavigation) => void | boolean;
  notFoundHandler?: (href: string) => void;
}

export interface CompleteFailureOutcome {
  /** When set, engine assigns `prev`; when omitted, `prev` is unchanged. */
  setPrev?: MatchedRouteInfo | null;
}

/**
 * NOT_FOUND callbacks + `prev` hint.
 * Non-notFound terminal errors are observed via bus `navigation:error`.
 * History is applied by the engine via {@link ../history/history-policy}.
 */
export function finalizeFailure(
  failure: FailedNavigation,
  deps: CompleteFailureDeps,
): CompleteFailureOutcome {
  if (failure.isNotFound) {
    const recoveryAllowed = deps.onNotFound?.(failure) !== false;
    if (recoveryAllowed) {
      deps.notFoundHandler?.(failure.href);
    }
    return { setPrev: null };
  }

  return failure.viewCommitted ? { setPrev: failure.to } : {};
}
