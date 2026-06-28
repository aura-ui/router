import type { HistoryAction, NavigateHistoryOptions } from '../history';
import {
  applyHistoryPolicy,
  resolveErrorHistoryPolicy,
  type HistoryProviderLike,
} from '../history/history-policy';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { isViewCommittedForHistory, type CommitSnapshot } from '../processor/view-mount/view-mount-state';
import { NavigationError } from './navigation-error';
import type { TransactionResult } from '../processor/processor-pipeline';

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

/**
 * Failed navigation — single object from pipeline or pre-match NOT_FOUND through engine finalization.
 *
 * Read top-to-bottom: factories → {@link complete} (callbacks, history, `prev`).
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

  toResult(): Extract<TransactionResult, { status: 'error' }> {
    return { status: 'error', failure: this };
  }

  /** Callbacks → history policy → `prev` hint. */
  complete(deps: CompleteFailureDeps): CompleteFailureOutcome {
    if (this.isNotFound) {
      const recoveryAllowed = deps.onNotFound?.(this) !== false;
      if (recoveryAllowed) {
        deps.notFoundHandler?.(this.href);
      }
    } else {
      deps.onNavigationError?.(this);
    }

    applyHistoryPolicy(
      resolveErrorHistoryPolicy(this.error.code, this.commit, this.action, {
        syncHistory: deps.options.syncHistory,
      }),
      {
        href: this.href,
        fromHref: this.from?.href ?? null,
        options: deps.options,
      },
      deps.provider,
    );

    if (this.isNotFound) {
      return { setPrev: null };
    }

    return this.viewCommitted ? { setPrev: this.to } : {};
  }
}

export function createNotFoundError(href: string): NavigationError {
  return FailedNavigation.notFound(href, null, 'push').error;
}

export function createNotFoundTransactionResult(
  href: string,
): Extract<TransactionResult, { status: 'error' }> {
  return FailedNavigation.notFound(href, null, 'push').toResult();
}
