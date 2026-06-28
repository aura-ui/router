import type { FailedNavigation } from './navigation-failure';

export type NavigationErrorPhase =
  | 'match'
  | 'leave'
  | 'enter'
  | 'load'
  | 'reenter'
  | 'render'
  | 'transitionOut'
  | 'transitionIn'
  | 'left'
  | 'after';

/**
 * Error hook (`error="…"`) threw while handling a navigation failure.
 * `error` — hook failure; `parent` — the failed navigation being handled.
 */
export interface NavigationHookErrorDetail {
  error: unknown;
  phase: 'error';
  parent: FailedNavigation;
}

export type ReportNavigationHookError = (
  hookError: unknown,
  parent: FailedNavigation,
) => void;
