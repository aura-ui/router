import type {
  NavigateOptions,
  NotFoundHandler,
  ProviderRouteRegistration,
  RoutingEngineBinding,
  RoutingEngineConfig,
} from './types';

/**
 * Adapter interface for a third-party routing library (Navigo, URLPattern, page.js, …).
 *
 * ## Lifecycle
 *
 * 1. Created via {@link RoutingProviderRegistry.create} with the **full** provider config.
 * 2. {@link bind} — wire facade callbacks (config is already applied).
 * 3. {@link registerRoute} — register all routes **before** {@link start}.
 * 4. {@link start} — listen to navigation and handle the initial URL.
 * 5. {@link destroy} — cleanup.
 *
 * ## Phase pipeline
 *
 * All providers MUST follow {@link PHASE_PIPELINE} from `./types`.
 *
 * ## Guard results
 *
 * After each blocking phase (`enter`, `load`, `leave`):
 * 1. Await the phase handler.
 * 2. Call `binding.onGuardResult(result)`.
 * 3. If it returns `true` — abort the pipeline (cancel or redirect already handled).
 *
 * Providers MUST NOT call `navigate()` directly for redirect strings — the facade owns that.
 *
 * ## Config
 *
 * Provider-specific options (e.g. Navigo `strategy`) are passed to the factory at
 * `RoutingProviderRegistry.create(id, config)` — not via `bind()`.
 *
 * @see PHASE_PIPELINE
 */
export interface RoutingEngineProvider {
  /** Stable provider id, e.g. `'navigo'` or `'urlpattern'`. */
  readonly id: string;

  /**
   * Wire facade callbacks. Called once before `start()`.
   * Config was already applied in the factory constructor.
   */
  bind(binding: RoutingEngineBinding): void;

  /** Begin listening to navigation and handle the initial URL. */
  start(): void;

  /** Tear down listeners and release resources. */
  destroy(): void;

  /** Register a route pattern and its handlers with the underlying library. */
  registerRoute(registration: ProviderRouteRegistration): void;

  /** Remove all routes — optional; used when re-collecting routes from DOM. */
  clearRoutes?(): void;

  /** Navigate programmatically. */
  navigate(path: string, options?: NavigateOptions): void;

  /** Set handler for unmatched URLs. */
  setNotFoundHandler(handler: NotFoundHandler): void;

  /**
   * Re-scan the DOM for router links after dynamic content renders.
   * Optional — only needed for providers that intercept link clicks.
   */
  rebindLinks?(): void;
}

export type RoutingProviderFactory<T extends RoutingEngineConfig = RoutingEngineConfig> = (
  config: T,
) => RoutingEngineProvider;
