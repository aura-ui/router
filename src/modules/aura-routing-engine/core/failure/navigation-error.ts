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

/** Default failure code per error phase — single registry (replaces switch in `defaultCodeForPhase`). */
export const FAILURE_CODE_BY_PHASE = {
  match: 'NOT_FOUND',
  leave: 'GUARD_THROW',
  guard: 'GUARD_THROW',
  load: 'LOAD_FAILED',
  render: 'RENDER_FAILED',
  reenter: 'REENTER_FAILED',
  transitionOut: 'TRANSITION_FAILED',
  transitionIn: 'TRANSITION_FAILED',
  unmount: 'HOOK_THROW',
  ready: 'HOOK_THROW',
} as const satisfies Record<string, NavigationFailureCode>;

/** Phases where a navigation error can be attributed (pipeline + match + render). */
export type NavigationErrorPhase = keyof typeof FAILURE_CODE_BY_PHASE;

export interface NavigationErrorInit {
  code: NavigationFailureCode;
  phase: NavigationErrorPhase;
  routePattern: string;
  message: string;
  cause?: unknown;
}

/** Structured navigation error with native {@link Error.cause}. */
export class NavigationError extends Error {
  readonly code: NavigationFailureCode;
  readonly phase: NavigationErrorPhase;
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
  phase: NavigationErrorPhase;
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

export function defaultCodeForPhase(phase: NavigationErrorPhase): NavigationFailureCode {
  return FAILURE_CODE_BY_PHASE[phase] ?? 'INTERNAL';
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
