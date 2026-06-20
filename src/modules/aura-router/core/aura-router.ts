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

  get routes(){
    return this.querySelectorAll<AURARoute>(AURARoute.is);
  }

  connectedCallback(): void {
    if (!this.engine) {
      const processor = new AuraRoutingProcessor();
      this.engine = new AuraRoutingEngine(processor,{linksSelector: '[data-router-link]'} );
    }
    this.engine.isRunning && this.engine.stop();
    this.engine.replaceRoutes(Array.from(this.routes));
    this.engine!.setNotFoundHandler((path: string) => {
      this.innerHTML = 'page not found: ' + path;
    });
    this.engine.start();
  }

  disconnectedCallback(): void {
    this.engine?.destroy();
  }

  navigate(path: string, _options?: { replace?: boolean , syncHistory: boolean}): void {
    void this.engine.navigateTo(path, 'push', { replace: false, syncHistory: true });
  }

}
