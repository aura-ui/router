import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationErrorResult } from '../navigation/transaction-result';
import { isViewCommittedForHistory, type CommitSnapshot } from '../view-mount/view-mount-state';
import { NavigationError } from './navigation-error';

/**
 * Failed navigation — single object from pipeline or pre-match NOT_FOUND through engine finalization.
 *
 * Side effects (callbacks, history, `prev`) are applied by {@link finalizeFailure} in the engine.
 */
export class FailedNavigation {
  readonly error: NavigationError;
  readonly commit: CommitSnapshot;
  readonly from: MatchedRouteInfo | null;
  readonly action: HistoryAction;
  /** `null` for NOT_FOUND (no route match). */
  readonly to: MatchedRouteInfo | null;

  private constructor(
    error: NavigationError,
    commit: CommitSnapshot,
    from: MatchedRouteInfo | null,
    to: MatchedRouteInfo | null,
    action: HistoryAction,
  ) {
    this.error = error;
    this.commit = commit;
    this.from = from;
    this.to = to;
    this.action = action;
  }

  get href(): string {
    return this.to?.href ?? this.commit.href;
  }

  /** Whether target URL should be written to browser history (`commit.view === 'committed'`). */
  get viewCommitted(): boolean {
    return isViewCommittedForHistory(this.commit);
  }

  get isNotFound(): boolean {
    return this.to === null && this.error.code === 'NOT_FOUND';
  }

  static notFound(
    href: string,
    from: MatchedRouteInfo | null,
    action: HistoryAction,
  ): FailedNavigation {
    return new FailedNavigation(
      new NavigationError({
        code: 'NOT_FOUND',
        phase: 'match',
        routePattern: '*',
        message: `No route matched ${href}`,
      }),
      { view: 'none', href },
      from,
      null,
      action,
    );
  }

  static fromPipeline(
    error: NavigationError,
    commit: CommitSnapshot,
    from: MatchedRouteInfo | null,
    to: MatchedRouteInfo,
    action: HistoryAction,
  ): FailedNavigation {
    return new FailedNavigation(error, commit, from, to, action);
  }

  toResult(): NavigationErrorResult {
    return { status: 'error', failure: this };
  }
}

export function createNotFoundError(href: string): NavigationError {
  return FailedNavigation.notFound(href, null, 'push').error;
}

export function createNotFoundTransactionResult(href: string): NavigationErrorResult {
  return FailedNavigation.notFound(href, null, 'push').toResult();
}
