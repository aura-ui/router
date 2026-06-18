import type { RoutingEngineProvider } from './provider';
import type { RoutingEngineConfig } from './types';
import { RoutingProviderRegistry } from './provider-registry';
import type {
  NavigateOptions,
  NavigationEvent,
  NotFoundHandler,
  RouteMatch,
  RouteRegistration,
} from './types';

export interface RoutingEngineOptions {
  provider: RoutingEngineProvider;
}

export type NavigationHandler = (event: NavigationEvent) => Promise<boolean>;

/**
 * Framework-agnostic routing facade.
 *
 * Provider reports {@link NavigationEvent} (`from` / `to`); orchestration runs via
 * {@link setNavigationHandler} (typically NavigationCoordinator in aura-router).
 */
export class RoutingEngine {
  private readonly provider: RoutingEngineProvider;
  private readonly routes = new Map<string, RouteRegistration>();
  private navigationHandler?: NavigationHandler;
  private current: RouteMatch | null = null;
  private previous: RouteMatch | null = null;
  private started = false;

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
      onNavigate: async (event) => this.handleNavigate(event),
    });
  }

  get providerId(): string {
    return this.provider.id;
  }

  /** Wire coordinator-owned navigation pipeline. */
  setNavigationHandler(handler: NavigationHandler): void {
    this.navigationHandler = handler;
  }

  register(registration: RouteRegistration): void {
    const { pattern } = registration;

    if (this.routes.has(pattern)) {
      console.warn(`Duplicate route pattern "${pattern}" — previous route will be overwritten`);
    }

    this.routes.set(pattern, registration);

    this.provider.registerRoute({ pattern });
  }

  registerAll(registrations: RouteRegistration[]): void {
    registrations.forEach((r) => this.register(r));
  }

  getRegisteredPatterns(): string[] {
    return [...this.routes.keys()];
  }

  getRoute(pattern: string): RouteRegistration | undefined {
    return this.routes.get(pattern);
  }

  getCurrentMatch(): RouteMatch | null {
    return this.current;
  }

  getPreviousMatch(): RouteMatch | null {
    return this.previous;
  }

  setNotFoundHandler(handler: NotFoundHandler): void {
    this.provider.setNotFoundHandler(handler);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.provider.start();
  }

  destroy(): void {
    this.started = false;
    this.provider.destroy();
    this.routes.clear();
    this.navigationHandler = undefined;
    this.current = null;
    this.previous = null;
  }

  navigate(path: string, options?: NavigateOptions): void {
    this.provider.navigate(path, options);
  }

  rebindLinks(): void {
    this.provider.rebindLinks?.();
  }

  clearRoutes(): void {
    this.routes.clear();
    this.current = null;
    this.previous = null;
    this.provider.clearRoutes?.();
  }

  private async handleNavigate(event: NavigationEvent): Promise<boolean> {
    if (!this.navigationHandler) {
      console.warn('RoutingEngine: no navigation handler — navigation ignored');
      return false;
    }

    const ok = await this.navigationHandler(event);

    if (ok) {
      this.previous = event.from;
      this.current = event.to;
    }

    return ok;
  }
}
