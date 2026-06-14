import type {
  NavigateOptions,
  NotFoundHandler,
  ProviderRouteRegistration,
  RoutingEngineConfig,
} from './types';

/**
 * Adapter interface for a third-party routing library (Navigo, URLPattern, page.js, …).
 *
 * Each provider translates aura-ui-router phases to the library's hook model.
 * The facade (`RoutingEngine`) owns route registration; the provider owns URL matching
 * and browser integration (history, link clicks).
 *
 * @example Phase mapping for Navigo
 * | aura phase  | Navigo API        |
 * |-------------|-------------------|
 * | enter       | addBeforeHook     |
 * | entered     | addAfterHook      |
 * | leave       | addLeaveHook      |
 * | reentered   | addAlreadyHook    |
 */
export interface RoutingEngineProvider {
  /** Stable provider id, e.g. `'navigo'` or `'urlpattern'`. */
  readonly id: string;

  /** Apply shared config before `start()`. */
  configure(config: RoutingEngineConfig): void;

  /** Begin listening to navigation (history, link clicks, initial resolve). */
  start(): void;

  /** Tear down listeners and release resources. */
  destroy(): void;

  /** Register a route and its phase handlers with the underlying library. */
  registerRoute(registration: ProviderRouteRegistration): void;

  /** Remove all routes — optional; used when re-collecting routes from DOM. */
  clearRoutes?(): void;

  /** Navigate programmatically. */
  navigate(path: string, options?: NavigateOptions): void;

  /** Resolve the current URL on startup (after all routes are registered). */
  resolve(): void;

  /** Re-bind intercepted page links after DOM updates. */
  updatePageLinks(): void;

  /** Set handler for unmatched URLs. */
  setNotFoundHandler(handler: NotFoundHandler): void;

  /**
   * Last resolved match — optional.
   * Used to build `from` in lifecycle context. If omitted, the facade tracks history itself.
   */
  getLastResolved?(): RouteMatchSnapshot | null;
}

/** Minimal match snapshot returned by providers that track resolution history. */
export interface RouteMatchSnapshot {
  url: string;
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export type RoutingProviderFactory = (config: RoutingEngineConfig) => RoutingEngineProvider;
