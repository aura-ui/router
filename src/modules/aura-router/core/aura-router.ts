import { attr } from '../../aura-utils/decorators';
import { AURARoute, type AURARouteConfigureOptions } from '../../aura-route/core';
import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteHookDefinition, RouterInstance } from '../../aura-route-hooks/core';
import { AuraRoutingEngine } from '../../aura-routing-engine/core/aura-routing-engine';
import { AuraRoutingProcessor } from '../../aura-routing-engine/core/aura-routing-processor';

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine: AuraRoutingEngine;

  static use(hook: RouteHookDefinition, options?: Record<string, unknown>): void {
    RouteHookRegistry.register(hook, options);
  }

  static configure(options: AURARouteConfigureOptions): void {
    AURARoute.configure(options);
  }

  connectedCallback(): void {
    this.setupRouting();
   // this.engine!.setNotFoundHandler(() => {
   //   this.innerHTML = 'page not found';
   // });
    this.engine.start();
  }

  disconnectedCallback(): void {
    this.engine?.destroy();
  }

  navigate(path: string, options?: { replace?: boolean }): void {
   // todo
   // this.engine.navigateTo(path, options, {});
  }

  private setupRouting(): void {
    if (!this.engine) {
      const processor = new AuraRoutingProcessor();
      this.engine = new AuraRoutingEngine(processor);
    }
    this.engine.isRunning && this.engine.stop();
    const routes = this.querySelectorAll<AURARoute>(AURARoute.is);
    this.engine.registerRoutes(Array.from(routes));
  }
}
