import { attr } from '../../aura-utils/decorators';
import { AURARoute, type AURARouteConfigureOptions } from '../../aura-route/core';
import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteHookDefinition } from '../../aura-route-hooks/core';
import {
  AuraRoutingEngine,
  type AuraRoutingEngineConfig,
  type NotFoundHandler,
} from '../../aura-routing-engine/core/aura-routing-engine';
import { AuraRoutingProcessor } from '../../aura-routing-engine/core/aura-routing-processor';
import type {
  HistoryAction,
  NavigateHistoryOptions,
} from '../../aura-routing-engine/core/aura-routing-history-navigator';
import {
  AuraRouterNotFoundController,
  AURA_ROUTER_NOT_FOUND,
} from './aura-router-not-found-controller';

export { AURA_ROUTER_NOT_FOUND };

export interface AuraRouterConfigureOptions extends AURARouteConfigureOptions {
  /** Глобальный handler 404. Перекрывает not-found-template. */
  notFoundHandler?: NotFoundHandler | null;
}

/** Minimal router surface exposed to route hooks. */
export interface RouterInstance {
  navigate(path: string, options?: Partial<NavigateHistoryOptions>): void;
}

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  @attr({ readonly: true, cached: true }) notFoundTemplate: string;
  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine?: AuraRoutingEngine;
  private readonly notFound = new AuraRouterNotFoundController(this);

  static use(hook: RouteHookDefinition, options?: Record<string, unknown>): void {
    RouteHookRegistry.register(hook, options);
  }

  static configure(options: AuraRouterConfigureOptions): void {
    if ('notFoundHandler' in options) {
      AuraRouterNotFoundController.configure(options.notFoundHandler);
    }
    AURARoute.configure(options);
  }

  /** Per-instance override (перекрывает configure и template). */
  setNotFoundHandler(handler: NotFoundHandler | null): void {
    this.notFound.setHandler(handler);
    this.ensureEngine().setNotFoundHandler((url) => this.notFound.handle(url));
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
    this.notFound.reset();
  }

  private ensureEngine(): AuraRoutingEngine {
    if (!this.engine) {
      const config: AuraRoutingEngineConfig = {
        linksSelector: this.linksSelector,
        onRouteMatched: () => this.notFound.hide(),
      };
      this.engine = new AuraRoutingEngine(new AuraRoutingProcessor(), config);
      this.engine.setNotFoundHandler((url) => this.notFound.handle(url));
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
