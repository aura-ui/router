/**
 * Navigation **failure** — terminal snapshot of a navigation that did not succeed.
 *
 * Pair with {@link ./navigation-error!NavigationError}:
 * - `NavigationError` = what went wrong
 * - `NavigationFailure` = failed attempt (`error` + from/to/commit/action)
 *
 * Model only. Side effects → {@link ../navigation/navigation-outcome!applyNavigationOutcome}.
 */

import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationErrorResult } from '../navigation/types';
import type { RedirectErrorOutcome } from '../redirect/types';
import { isViewCommittedForHistory, type ViewCommitSnapshot } from '../view-mount/view-commit-state';

import { NavigationError } from './navigation-error';

export class NavigationFailure {
  /** Structured cause — see {@link NavigationError}. */
  readonly error: NavigationError;
  readonly commit: ViewCommitSnapshot;
  readonly from: MatchedRouteInfo | null;
  readonly action: HistoryAction;
  /** `null` for NOT_FOUND (no route match). */
  readonly to: MatchedRouteInfo | null;

  private constructor(
    error: NavigationError,
    commit: ViewCommitSnapshot,
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
  ): NavigationFailure {
    return new NavigationFailure(
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

  /** Pre-commit redirect chain failure (cycle or max depth). Emits `navigation:error`. */
  static redirectError(
    code: RedirectErrorOutcome['code'],
    href: string,
    from: MatchedRouteInfo | null,
    action: HistoryAction,
  ): NavigationFailure {
    const failureCode = code === 'redirect-cycle' ? 'REDIRECT_CYCLE' : 'REDIRECT_DEPTH_EXCEEDED';
    const message =
      code === 'redirect-cycle'
        ? `Redirect cycle detected at ${href}`
        : `Redirect depth exceeded at ${href}`;

    return new NavigationFailure(
      new NavigationError({
        code: failureCode,
        phase: 'match',
        routePattern: '*',
        message,
      }),
      { view: 'none', href },
      from,
      null,
      action,
    );
  }

  static fromPipeline(
    error: NavigationError,
    commit: ViewCommitSnapshot,
    from: MatchedRouteInfo | null,
    to: MatchedRouteInfo,
    action: HistoryAction,
  ): NavigationFailure {
    return new NavigationFailure(error, commit, from, to, action);
  }

  toResult(): NavigationErrorResult {
    return { status: 'error', failure: this };
  }
}

/**
 * Error hook (`error="…"`) threw while handling a navigation failure.
 * `error` — hook throw; `parent` — the {@link NavigationFailure} being handled.
 */
export interface NavigationHookErrorDetail {
  error: unknown;
  phase: 'error';
  parent: NavigationFailure;
}

export type ReportNavigationHookError = (
  hookError: unknown,
  parent: NavigationFailure,
) => void;
