import type { RoutePhase } from '../../aura-route-hooks/core';

/** Result of matching a URL against a registered route pattern. */
export interface RouteMatch {
  /** Resolved URL path (may differ from the route pattern). */
  url: string;
  /** Registered route pattern, e.g. `/user/:id`. */
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export type NavigateOptions = {
  replace?: boolean;
};

export type RoutingStrategy = 'ONE' | 'ALL';

/** Shared engine / provider configuration. */
export interface RoutingEngineConfig {
  /** Base path passed to the underlying library. Default: `'/'`. */
  root?: string;
  /** Selector for in-app links to intercept. Default: `'[data-router-link]'`. */
  linksSelector?: string;
  hash?: boolean;
  strategy?: RoutingStrategy;
  noMatchWarning?: boolean;
}

/**
 * Called by the provider when navigation must be confirmed or cancelled.
 * Used for `enter` and `leave` phases that can block navigation.
 *
 * - `done()` / `done(true)` — allow navigation
 * - `done(false)` — cancel navigation
 */
export type PhaseDone = (allow?: boolean) => void;

/** Provider-level phase handler. Receives match data only — no WC / hook context. */
export type PhaseHandler = (
  match: RouteMatch,
  done?: PhaseDone,
) => void | Promise<void>;

/** Handlers for a single route, keyed by aura-ui-router phase. */
export type RoutePhaseHandlers = Partial<Record<RoutePhase, PhaseHandler>>;

/** Called when a route pattern matches and content should render. */
export type RouteMatchHandler = (match: RouteMatch) => void | Promise<void>;

/** Called when no registered route matches the URL. */
export type NotFoundHandler = (url: string) => void;

/** Public registration payload — used by `AURARouter` when wiring is migrated. */
export interface RouteRegistration {
  path: string;
  onMatch: RouteMatchHandler;
  phases?: RoutePhaseHandlers;
}

/** Payload passed from the facade to a provider adapter. */
export interface ProviderRouteRegistration {
  path: string;
  onMatch: RouteMatchHandler;
  phases: RoutePhaseHandlers;
}
