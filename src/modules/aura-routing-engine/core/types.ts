import type { RoutePhase } from '../../aura-route-hooks/core';

/**
 * Result of matching a URL against a registered route pattern.
 * `path` is the resolved pathname; `pattern` is the registered template.
 */
export interface RouteMatch {
  /** Resolved URL pathname, e.g. `/user/42`. */
  path: string;
  /** Registered route pattern, e.g. `/user/:id`. */
  pattern: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export type NavigateOptions = {
  replace?: boolean;
};

/** Engine-level config shared by all providers. Passed once via {@link RoutingProviderRegistry.create}. */
export interface RoutingEngineConfig {
  /** Selector for in-app links to intercept. Default: `'[data-router-link]'`. */
  linksSelector?: string;
  /** Use hash-based routing. Default: `false`. */
  hash?: boolean;
}

/**
 * Phase guard result — return-based, provider-agnostic.
 *
 * Interpretation (handled by the facade via {@link RoutingEngineBinding.onGuardResult}):
 * - `void` / `true` — allow navigation to continue
 * - `false` — cancel the current navigation
 * - `string` — redirect to the given path (facade calls `navigate()`)
 */
export type GuardResult = void | boolean | string;

/**
 * Context passed to phase handlers during a navigation transition.
 *
 * `from` / `to` reflect the navigation snapshot at the moment the phase runs:
 * - on `leave` — `from` is the active route (providers MUST set non-null), `to` is the navigation target
 * - on `enter` / `entered` / `reentered` — `to` is the target route, `from` is the previous route
 */
export interface NavigationContext {
  phase: RoutePhase;
  to: RouteMatch;
  from: RouteMatch | null;
}

export type PhaseHandler = (
  ctx: NavigationContext,
) => GuardResult | Promise<GuardResult>;

/**
 * Handlers for a single route, keyed by aura-ui-router phase.
 *
 * See {@link PHASE_PIPELINE} for the required execution order.
 */
export type RoutePhaseHandlers = Partial<Record<RoutePhase, PhaseHandler>>;

/** Called when a route pattern matches and content should render. */
export type RouteRenderHandler = (match: RouteMatch) => void | Promise<void>;

/** Called when no registered route matches the URL. */
export type NotFoundHandler = (url: string) => void;

/**
 * Committed navigation transition — reported to the facade.
 *
 * The provider MUST call {@link RoutingEngineBinding.onTransition} once per navigation,
 * after a successful match and **before** the `enter` phase handlers run.
 */
export interface NavigationTransition {
  from: RouteMatch | null;
  to: RouteMatch;
}

/** Public route registration — used by `AURARouter` when wiring is migrated. */
export interface RouteRegistration {
  /** Registered route pattern, e.g. `/user/:id`. */
  pattern: string;
  render: RouteRenderHandler;
  phases?: RoutePhaseHandlers;
}

/** Payload passed from the facade to a provider adapter. */
export interface ProviderRouteRegistration {
  pattern: string;
  render: RouteRenderHandler;
  phases: RoutePhaseHandlers;
}

/**
 * Callbacks the facade exposes to the provider.
 *
 * Wired once via {@link RoutingEngineProvider.bind} before `start()`.
 */
export interface RoutingEngineBinding {
  /**
   * Sync facade navigation state.
   * Call after match, before `enter` phase handlers.
   */
  onTransition(transition: NavigationTransition): void;

  /**
   * Process a {@link GuardResult} from a blocking phase (`enter` or `leave`).
   * Return `true` when navigation must stop (cancelled or redirected).
   *
   * The provider MUST await the phase handler and call this before continuing the pipeline.
   */
  onGuardResult(result: GuardResult): boolean | Promise<boolean>;
}

/**
 * Required navigation pipeline for all providers.
 *
 * ```
 * 1. leave   (from route) — blocking; call onGuardResult after handler
 * 2. onTransition({ from, to }) — engine callback, NOT a route hook
 * 3. enter   (to route)   — blocking; call onGuardResult after handler
 * 4. render(match)
 * 5. entered (to route)
 * ```
 *
 * `onTransition` syncs facade state (`current` / `previous`). It is not part of
 * {@link RoutePhaseHandlers} — providers call {@link RoutingEngineBinding.onTransition} directly.
 *
 * **reentered** — when navigation targets the already active route (same path):
 * skip `leave` + `enter` + `render`; run only `reentered` handlers.
 *
 * Register routes via `registerRoute()` before `start()`.
 */
export const PHASE_PIPELINE = [
  'leave',
  'onTransition',
  'enter',
  'render',
  'entered',
] as const;
