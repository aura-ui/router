import type { NavigationErrorPhase } from './navigation-error.types';

/** Stable codes for recovery, telemetry, and i18n. */
export type NavigationFailureCode =
  | 'NOT_FOUND'
  | 'GUARD_THROW'
  | 'HOOK_THROW'
  | 'LOAD_FAILED'
  | 'CONTENT_LOAD_FAILED'
  | 'RENDER_FAILED'
  | 'TRANSITION_FAILED'
  | 'REENTER_FAILED'
  | 'INTERNAL';

export interface NavigationErrorInit {
  code: NavigationFailureCode;
  phase: NavigationErrorPhase | 'match';
  routePattern: string;
  message: string;
  cause?: unknown;
}

/** Structured navigation error with native {@link Error.cause}. */
export class NavigationError extends Error {
  readonly code: NavigationFailureCode;
  readonly phase: NavigationErrorPhase | 'match';
  readonly routePattern: string;

  constructor(init: NavigationErrorInit) {
    super(init.message, { cause: init.cause });
    this.name = 'NavigationError';
    this.code = init.code;
    this.phase = init.phase;
    this.routePattern = init.routePattern;
  }
}

export function isNavigationError(error: unknown): error is NavigationError {
  return error instanceof NavigationError;
}

export interface NormalizeFailureContext {
  phase: NavigationErrorPhase | 'match';
  routePattern: string;
  defaultCode?: NavigationFailureCode;
}

/** Single normalization path for pipeline, view, and content layers. */
export function normalizeFailure(error: unknown, ctx: NormalizeFailureContext): NavigationError {
  if (error instanceof NavigationError) {
    return error;
  }

  const code = ctx.defaultCode ?? defaultCodeForPhase(ctx.phase);
  const message = error instanceof Error ? error.message : String(error);

  return new NavigationError({
    code,
    phase: ctx.phase,
    routePattern: ctx.routePattern,
    message,
    cause: error,
  });
}

export function defaultCodeForPhase(phase: NavigationErrorPhase | 'match'): NavigationFailureCode {
  switch (phase) {
    case 'match':
      return 'NOT_FOUND';
    case 'load':
      return 'LOAD_FAILED';
    case 'render':
      return 'RENDER_FAILED';
    case 'transitionOut':
    case 'transitionIn':
      return 'TRANSITION_FAILED';
    case 'reenter':
      return 'REENTER_FAILED';
    case 'leave':
    case 'enter':
      return 'GUARD_THROW';
    case 'left':
    case 'after':
      return 'HOOK_THROW';
    default:
      return 'INTERNAL';
  }
}

export function createContentLoadError(
  loader: string,
  routePattern: string,
  cause: unknown,
): NavigationError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new NavigationError({
    code: 'CONTENT_LOAD_FAILED',
    phase: 'render',
    routePattern,
    message: `Failed to load ${loader} for route ${routePattern}: ${detail}`,
    cause,
  });
}
