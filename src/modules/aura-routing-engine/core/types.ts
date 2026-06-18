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
 * Interpretation (handled by NavigationCoordinator):
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
 * - on `enter` / `load` / `entered` / `reentered` / `error` — `to` is the target route, `from` is the previous route
 * - on `leaving` / `left` — same snapshot as `leave`: `from` = leaving route, `to` = target
 * - on `error` — `error` carries the failure from `load` or `render`
 */
export interface NavigationContext {
  phase: RoutePhase;
  to: RouteMatch;
  from: RouteMatch | null;
  error?: unknown;
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

export type NavigationIntent = 'push' | 'replace' | 'pop' | 'system';

/**
 * Navigation event reported by the provider to the facade.
 * Phase orchestration is owned by NavigationCoordinator — not the provider.
 */
export interface NavigationEvent {
  from: RouteMatch | null;
  to: RouteMatch;
  intent: NavigationIntent;
  /** Same route re-navigation (skip full transition, run `reentered` only). */
  reentered: boolean;
}

/** @deprecated Use {@link NavigationEvent}. */
export interface NavigationTransition {
  from: RouteMatch | null;
  to: RouteMatch;
}

/** Public route registration — used by `AURARouter` when wiring routes. */
export interface RouteRegistration {
  /** Registered route pattern, e.g. `/user/:id`. */
  pattern: string;
  /** Optional — `AURARouter` commits via `renderRoute()` instead. */
  render?: RouteRenderHandler;
  phases?: RoutePhaseHandlers;
}

/** Payload passed from the facade to a provider adapter. */
export interface ProviderRouteRegistration {
  pattern: string;
  /** Legacy Navigo adapter — ignored by internal provider. */
  render?: RouteRenderHandler;
  phases?: RoutePhaseHandlers;
}

/**
 * Callbacks the facade exposes to the provider.
 *
 * Internal provider calls {@link onNavigate} once per navigation with `from` / `to`.
 * Coordinator owns the phase pipeline (prepare → commit → post).
 */
export interface RoutingEngineBinding {
  /**
   * Run the full navigation transaction.
   * @returns `true` when navigation committed; `false` when cancelled (provider may rollback history).
   */
  onNavigate(event: NavigationEvent): Promise<boolean>;
}

/**
 * Required navigation pipeline for all providers.
 *
 * ```
 * 1. leave    (from route) — blocking; call onGuardResult after handler
 * 2. leaving  (from route) — non-blocking; transition out (animation)
 * 3. left     (from route) — non-blocking cleanup after leave approved
 * 4. onTransition({ from, to }) — engine callback, NOT a route hook
 * 5. enter    (to route)   — blocking; call onGuardResult after handler
 * 6. load     (to route)   — blocking; call onGuardResult after handler
 * 7. entering (to route)   — non-blocking; transition in (animation)
 * 8. render(match)
 * 9. entered  (to route)
 * ```
 *
 * `onTransition` syncs facade state (`current` / `previous`). It is not part of
 * {@link RoutePhaseHandlers} — providers call {@link RoutingEngineBinding.onTransition} directly.
 *
 * **reentered** — when navigation targets the already active route (same path):
 * skip `leave` + `leaving` + `left` + `enter` + `load` + `entering` + `render`; run only `reentered`.
 *
 * **error** — when `load` or `render` throws: run `error` hooks instead of `entered`; navigation stops.
 *
 * Register routes via `registerRoute()` before `start()`.
 */
export const PHASE_PIPELINE = [
  'leave',
  'leaving',
  'left',
  'onTransition',
  'enter',
  'load',
  'entering',
  'render',
  'entered',
] as const;
