import { attr } from '../../aura-utils/decorators';
import { AURARoute, type AURARouteConfigureOptions } from '../../aura-route/core';
import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteHookDefinition } from '../../aura-route-hooks/core';
import { AuraRoutingEngine } from '../../aura-routing-engine/core/aura-routing-engine';
import { AuraRoutingProcessor } from '../../aura-routing-engine/core/aura-routing-processor';
import type { RoutingEngineConfig } from '../../aura-routing-engine/core/types';
import type {
  HistoryAction,
  NavigateHistoryOptions,
} from '../../aura-routing-engine/core/aura-routing-history-navigator';

/** Minimal router surface exposed to route hooks. */
export interface RouterInstance {
  navigate(path: string, options: NavigateHistoryOptions): void;
}

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine?: AuraRoutingEngine;

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
    const engine = this.ensureEngine();
    if (engine.isRunning) engine.stop();
    this.refreshRoutes();
    engine.start();
  }

  disconnectedCallback(): void {
    this.engine?.destroy();
    this.engine = undefined;
  }

  private ensureEngine(): AuraRoutingEngine {
    if (!this.engine) {
      const config: RoutingEngineConfig = {
        linksSelector: this.linksSelector,
      };
      this.engine = new AuraRoutingEngine(new AuraRoutingProcessor(), config);
      this.engine.setNotFoundHandler((path: string) => {
        this.innerHTML = 'page not found: ' + path;
      });
    }
    return this.engine;
  }

  refreshRoutes(): void {
    this.ensureEngine().replaceRoutes(Array.from(this.routes));
  }

  navigate(path: string, options: NavigateHistoryOptions): void {
    const replace = options.replace ?? false;
    const syncHistory = options.syncHistory ?? true;
    const action: HistoryAction = replace ? 'replace' : 'push';
    void this.ensureEngine().navigateTo(path, action, { replace, syncHistory });
  }
}
