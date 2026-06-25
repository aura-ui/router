import { attr } from '../../aura-utils/decorators';

import { AuraRoute } from '../../aura-route/core';
import { configureRouteContentLoader } from '../../aura-route/core/route-content-loader';
import { RouteViewCache } from '../../aura-route/core/route-view-cache';
import type { CacheStoreOptions } from '../../aura-cache-store/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import {
  ContentLoaderRegistry,
  type ContentLoaderService,
  type LoaderConstructor,
} from '../../aura-content-loaders/core';

import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteHookDefinition, RouterInstance } from '../../aura-route-hooks/core';
import {
  AuraRoutingEngine,
  AuraRoutingProcessor,
  isCatchAllRoute,
  parseTransitionPolicy,
  type AuraRoutingEngineConfig,
  type HistoryAction,
  type NavigateHistoryOptions,
} from '../../aura-routing-engine/core';
import { AuraRouterNotFoundController } from './aura-router-not-found-controller';
import type { NotFoundHandler } from './aura-router-not-found.types';
import {
  AURA_ROUTER_NAVIGATION_ERROR,
  type AuraRouterNavigationErrorEventDetail,
} from './aura-router-navigation-error.types';
import { dispatchCustomEvent } from '../../aura-utils/misc';
import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';

export {
  AURA_ROUTER_NOT_FOUND,
  type NotFoundHandler,
  type NotFoundSource,
  type AuraRouterNotFoundEventDetail,
  type AuraRouterNotFoundEvent,
} from './aura-router-not-found.types';

export {
  AURA_ROUTER_NAVIGATION_ERROR,
  type AuraRouterNavigationErrorEventDetail,
  type AuraRouterNavigationErrorEvent,
  type NavigationErrorPhase,
} from './aura-router-navigation-error.types';

export interface AuraRouterConfigureOptions {
  /** Shared loader service for all `<aura-route>` elements. */
  contentLoaderService?: ContentLoaderService;
  /** LRU cache for keep-alive route views (`detachedRoot` DOM). */
  viewCache?: CacheStoreOptions<ViewRoot>;
  /** Fallback 404 handler (когда нет `<aura-route path="*">`). Перекрывает not-found-template. */
  notFoundHandler?: NotFoundHandler | null;
}

export type { RouterInstance } from '../../aura-route-hooks/core';

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  /** Fallback template id — когда нет `<aura-route path="*">`. */
  @attr({ readonly: true, cached: true }) notFoundTemplate: string;
  @attr({ dataAttr: true, defaultValue: '[data-router-link]' })
  linksSelector: string;
  /** `out-in` | `in-out` | `parallel` — порядок transition-out/transition-in относительно render. */
  @attr({ dataAttr: true, defaultValue: 'out-in' })
  transition: string;

  private engine?: AuraRoutingEngine;
  private readonly notFound = new AuraRouterNotFoundController(this);

  static use(
    hook: RouteHookDefinition,
    options?: Record<string, unknown>
  ): void {
    RouteHookRegistry.register(hook, options);
  }

  static configure(options: AuraRouterConfigureOptions): void {
    if ('notFoundHandler' in options) {
      AuraRouterNotFoundController.configure(options.notFoundHandler);
    }
    if (options.contentLoaderService) {
      configureRouteContentLoader(options.contentLoaderService);
    }
    if (options.viewCache) {
      RouteViewCache.configure(options.viewCache);
    }
  }

  /** Registers a custom content loader type for `source` on any `<aura-route>`. */
  static registerLoader(type: string, loaderClass: LoaderConstructor): void {
    ContentLoaderRegistry.register(type, loaderClass);
  }

  /** Per-instance override (перекрывает configure и template). Только fallback. */
  setNotFoundHandler(handler: NotFoundHandler | null): void {
    this.notFound.setHandler(handler);
    this.ensureEngine().setNotFoundHandler((url) => this.notFound.handle(url));
  }

  get routes() {
    return this.querySelectorAll<AuraRoute>(AuraRoute.is);
  }

  get rootOutlet(): AuraOutlet {
    return this.querySelector(AuraOutlet.is) as AuraOutlet;
     // ?? this.#ensureDefaultOutlet();
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
      const transitionPolicy = parseTransitionPolicy(this.transition);
      const config: AuraRoutingEngineConfig = {
        linksSelector: this.linksSelector,
        transitionPolicy,
        onNavigationCommitted: (to) => {
          this.notFound.hide();
          if (isCatchAllRoute(to.pattern)) {
            AuraRouterNotFoundController.emit(this, to.href, 'route');
          }
        },
        onNavigationError: (detail) => {
          if (detail.viewCommitted) {
            this.notFound.hide();
          }
          dispatchCustomEvent(this, AURA_ROUTER_NAVIGATION_ERROR, {
            detail: {
              error: detail.error,
              href: detail.href,
              router: this,
              from: detail.from?.pathname ?? null,
              to: detail.to.pathname,
              phase: detail.phase,
              viewCommitted: detail.viewCommitted,
            } satisfies AuraRouterNavigationErrorEventDetail,
          });
        },
      };
      this.engine = new AuraRoutingEngine(
        new AuraRoutingProcessor(transitionPolicy),
        this,
        config,
      );
      this.engine.setNotFoundHandler((url) => this.notFound.handle(url));
    }
    return this.engine;
  }

  refreshRoutes(): void {
    this.ensureEngine().replaceRoutes(Array.from(this.routes));
  }

  navigate(path: string, options: Partial<NavigateHistoryOptions> = {}): void {
    const replace = options.replace ?? false;
    const syncHistory = options.syncHistory ?? true;
    const action: HistoryAction = replace ? 'replace' : 'push';
    void this.ensureEngine().navigateTo(path, action, { replace, syncHistory });
  }
}
