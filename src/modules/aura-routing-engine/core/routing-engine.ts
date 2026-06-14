import type { RoutingEngineProvider } from './provider';
import type { RoutingEngineConfig } from './types';
import { RoutingProviderRegistry } from './provider-registry';
import type {
  GuardResult,
  NavigateOptions,
  NotFoundHandler,
  RouteMatch,
  RouteRegistration,
} from './types';

export interface RoutingEngineOptions {
  provider: RoutingEngineProvider;
}

/**
 * Framework-agnostic routing facade.
 *
 * Orchestrates route registration and delegates URL matching / navigation
 * to a pluggable {@link RoutingEngineProvider}.
 *
 * @example
 * const engine = RoutingEngine.create('navigo', {
 *   root: '/',
 *   linksSelector: '[data-router-link]',
 * });
 */
export class RoutingEngine {
  private readonly provider: RoutingEngineProvider;
  private readonly routes = new Map<string, RouteRegistration>();
  private current: RouteMatch | null = null;
  private previous: RouteMatch | null = null;
  private started = false;

  /** Create an engine with a registered provider and full config. */
  static create<T extends RoutingEngineConfig>(
    providerId: string,
    config: T,
  ): RoutingEngine {
    return new RoutingEngine({
      provider: RoutingProviderRegistry.create(providerId, config),
    });
  }

  constructor(options: RoutingEngineOptions) {
    this.provider = options.provider;
    this.provider.bind({
      onTransition: (transition) => {
        this.previous = transition.from;
        this.current = transition.to;
      },
      onGuardResult: (result) => this.handleGuardResult(result),
    });
  }

  /** Underlying provider adapter (for debugging / advanced use). */
  get providerId(): string {
    return this.provider.id;
  }

  /** Register a route pattern. Duplicate patterns overwrite with a warning. */
  register(registration: RouteRegistration): void {
    const { pattern } = registration;

    if (this.routes.has(pattern)) {
      console.warn(`Duplicate route pattern "${pattern}" — previous route will be overwritten`);
    }

    this.routes.set(pattern, registration);

    this.provider.registerRoute({
      pattern,
      render: (match) => registration.render(match),
      phases: registration.phases ?? {},
    });
  }

  /** Register multiple routes at once. */
  registerAll(registrations: RouteRegistration[]): void {
    registrations.forEach((r) => this.register(r));
  }

  /** Return a snapshot of registered route patterns. */
  getRegisteredPatterns(): string[] {
    return [...this.routes.keys()];
  }

  /** Last matched route in this engine instance. */
  getCurrentMatch(): RouteMatch | null {
    return this.current;
  }

  /** Route matched before the current one. */
  getPreviousMatch(): RouteMatch | null {
    return this.previous;
  }

  setNotFoundHandler(handler: NotFoundHandler): void {
    this.provider.setNotFoundHandler(handler);
  }

  /**
   * Start the engine. Call after all routes are registered.
   * Provider handles the initial URL match internally.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.provider.start();
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
  rebindLinks(): void {
    this.provider.rebindLinks?.();
  }

  /** Clear registered routes before re-collecting from DOM. */
  clearRoutes(): void {
    this.routes.clear();
    this.current = null;
    this.previous = null;
    this.provider.clearRoutes?.();
  }

  /** @returns `true` when navigation must stop. */
  private handleGuardResult(result: GuardResult): boolean {
    if (result === false) return true;

    if (typeof result === 'string') {
      this.navigate(result);
      return true;
    }

    return false;
  }
}
