import type { RoutingEngineProvider } from './provider';
import type {
  NavigateOptions,
  NotFoundHandler,
  RouteMatch,
  RouteRegistration,
  RoutingEngineConfig,
} from './types';

export interface RoutingEngineOptions extends RoutingEngineConfig {
  provider: RoutingEngineProvider;
}

/**
 * Framework-agnostic routing facade.
 *
 * Orchestrates route registration and delegates URL matching / navigation
 * to a pluggable {@link RoutingEngineProvider}. `AURARouter` will use this
 * class instead of calling Navigo directly.
 */
export class RoutingEngine {
  private readonly provider: RoutingEngineProvider;
  private readonly routes = new Map<string, RouteRegistration>();
  private current: RouteMatch | null = null;
  private previous: RouteMatch | null = null;
  private started = false;

  constructor(options: RoutingEngineOptions) {
    this.provider = options.provider;
    this.provider.configure(options);
  }

  /** Underlying provider adapter (for debugging / advanced use). */
  get providerId(): string {
    return this.provider.id;
  }

  /** Register a route. Duplicate paths overwrite with a warning. */
  register(registration: RouteRegistration): void {
    const { path } = registration;

    if (this.routes.has(path)) {
      console.warn(`Duplicate route path "${path}" — previous route will be overwritten`);
    }

    this.routes.set(path, registration);

    this.provider.registerRoute({
      path,
      onMatch: async (match) => {
        this.previous = this.current;
        this.current = match;
        await registration.onMatch(match);
      },
      phases: registration.phases ?? {},
    });
  }

  /** Register multiple routes at once. */
  registerAll(registrations: RouteRegistration[]): void {
    registrations.forEach((r) => this.register(r));
  }

  /** Return a snapshot of registered paths. */
  getRegisteredPaths(): string[] {
    return [...this.routes.keys()];
  }

  /** Last matched route in this engine instance. */
  getCurrentMatch(): RouteMatch | null {
    return this.current;
  }

  /** Route matched before the current one. */
  getPreviousMatch(): RouteMatch | null {
    return this.previous ?? this.snapshotToMatch(this.provider.getLastResolved?.() ?? null);
  }

  setNotFoundHandler(handler: NotFoundHandler): void {
    this.provider.setNotFoundHandler(handler);
  }

  /**
   * Start the engine. Call after all routes are registered.
   * Invokes `resolve()` automatically.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.provider.start();
    this.provider.resolve();
  }

  destroy(): void {
    this.started = false;
    this.provider.destroy();
    this.routes.clear();
    this.current = null;
    this.previous = null;
  }

  navigate(path: string, options?: NavigateOptions): void {
    this.provider.navigate(path, options);
  }

  /** Re-bind link interception after route content renders. */
  updatePageLinks(): void {
    this.provider.updatePageLinks();
  }

  /** Re-collect routes: clears facade state and asks provider to reset if supported. */
  reset(): void {
    this.routes.clear();
    this.current = null;
    this.previous = null;
    this.provider.clearRoutes?.();
  }

  private snapshotToMatch(
    snapshot: ReturnType<NonNullable<RoutingEngineProvider['getLastResolved']>>,
  ): RouteMatch | null {
    if (!snapshot) return null;
    return {
      url: snapshot.url,
      path: snapshot.path,
      ...(snapshot.params && { params: { ...snapshot.params } }),
      ...(snapshot.query && { query: { ...snapshot.query } }),
    };
  }
}
