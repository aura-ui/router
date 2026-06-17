import { attr } from '../../aura-utils/decorators';
import { AURARoute, type AURARouteConfigureOptions } from '../../aura-route/core';
import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteHookDefinition, RouterInstance } from '../../aura-route-hooks/core';
import { RoutingEngine, type RouteRegistration } from '../../aura-routing-engine/core';
import { NavigationJobManager } from './navigation-job';
import { NavigationPhaseRunner } from './navigation-phase-runner';

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine!: RoutingEngine;
  private phaseRunner!: NavigationPhaseRunner;

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
    this.engine.setNotFoundHandler(() => {
      this.innerHTML = 'page not found';
    });
    this.engine.start();
  }

  disconnectedCallback(): void {
    this.jobManager.invalidate();
    this.engine?.destroy();
  }

  navigate(path: string, options?: { replace?: boolean }): void {
    this.engine.navigate(path, options);
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
    this.engine = RoutingEngine.create('navigo', {
      root: '/',
      strategy: 'ONE',
      hash: false,
      noMatchWarning: false,
      linksSelector: this.linksSelector,
    });
    this.phaseRunner = new NavigationPhaseRunner({
      jobManager: this.jobManager,
      router: this,
      navigate: (path, options) => this.navigate(path, options),
      rebindLinks: () => this.engine.rebindLinks(),
    });
    this.engine.registerAll([...routes.values()].map((route) => this.toRouteRegistration(route)));
  }

  private toRouteRegistration(route: AURARoute): RouteRegistration {
    const runner = this.phaseRunner;

    return {
      pattern: route.path,
      render: async () => {
        const job = this.jobManager.requireActive();
        const onAbort = () => route.cancelPendingRender();
        job.signal.addEventListener('abort', onAbort, { once: true });

        try {
          await route.render();
        } finally {
          job.signal.removeEventListener('abort', onAbort);
        }

        if (job.aborted) return;
      },
      phases: {
        enter: (ctx) => runner.runEnter(route, ctx),
        load: (ctx) => runner.runLoad(route, ctx),
        entering: (ctx) => runner.runEntering(route, ctx),
        entered: (ctx) => runner.runEntered(route, ctx),
        leave: (ctx) => runner.runLeave(route, ctx),
        leaving: (ctx) => runner.runLeaving(route, ctx),
        left: (ctx) => runner.runLeft(route, ctx),
        reentered: (ctx) => runner.runReentered(route, ctx),
        error: (ctx) => runner.runError(route, ctx),
      },
    };
  }
}
