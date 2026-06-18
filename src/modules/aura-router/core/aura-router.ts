import { attr } from '../../aura-utils/decorators';
import { AURARoute, type AURARouteConfigureOptions } from '../../aura-route/core';
import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteHookDefinition, RouterInstance } from '../../aura-route-hooks/core';
import { RoutingEngine } from '../../aura-routing-engine/core';
import { NavigationCoordinator } from './navigation-coordinator';
import { NavigationJobManager } from './navigation-job';
import { NavigationPhaseRunner } from './navigation-phase-runner';

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine?: RoutingEngine;
  private phaseRunner?: NavigationPhaseRunner;
  private coordinator?: NavigationCoordinator;
  private routes = new Map<string, AURARoute>();

  private readonly jobManager = new NavigationJobManager();

  static use(hook: RouteHookDefinition, options?: Record<string, unknown>): void {
    RouteHookRegistry.register(hook, options);
  }

  static configure(options: AURARouteConfigureOptions): void {
    AURARoute.configure(options);
  }

  connectedCallback(): void {
    const routes = this.collectRoutes();
    this.setupRouting(routes);
    this.engine!.setNotFoundHandler(() => {
      this.innerHTML = 'page not found';
    });
    this.engine!.start();
  }

  disconnectedCallback(): void {
    this.jobManager.invalidate();
    this.engine?.destroy();
    this.engine = undefined;
  }

  navigate(path: string, options?: { replace?: boolean }): void {
    this.engine!.navigate(path, options);
  }

  private collectRoutes(): Map<string, AURARoute> {
    const routes = new Map<string, AURARoute>();
    this.querySelectorAll<AURARoute>(AURARoute.is).forEach((route) => {
      if (!route.path) return;
      routes.set(route.path, route);
    });
    return routes;
  }

  private setupRouting(routes: Map<string, AURARoute>): void {
    this.jobManager.invalidate();
    this.routes = routes;

    if (!this.engine) {
      this.engine = RoutingEngine.create('internal', {
        linksSelector: this.linksSelector,
      });
      this.ensureOrchestration();
      this.engine.setNavigationHandler((event) => this.coordinator!.run(event));
    }

    this.engine.registerAll([...routes.keys()].map((pattern) => ({ pattern })));
  }

  private ensureOrchestration(): void {
    if (this.coordinator) return;

    this.phaseRunner = new NavigationPhaseRunner({
      jobManager: this.jobManager,
      router: this,
    });

    this.coordinator = new NavigationCoordinator({
      jobManager: this.jobManager,
      phaseRunner: this.phaseRunner,
      getRoute: (pattern) => this.routes.get(pattern),
      renderRoute: (route) => this.renderRoute(route),
      navigate: (path, options) => this.navigate(path, options),
      rebindLinks: () => this.engine!.rebindLinks(),
    });
  }

  private async renderRoute(route: AURARoute): Promise<void> {
    const job = this.jobManager.requireActive();
    const onAbort = () => route.cancelPendingRender();
    job.signal.addEventListener('abort', onAbort, { once: true });

    try {
      await route.render();
    } finally {
      job.signal.removeEventListener('abort', onAbort);
    }

    if (job.aborted) {
      throw new DOMException('Navigation aborted', 'AbortError');
    }
  }
}
