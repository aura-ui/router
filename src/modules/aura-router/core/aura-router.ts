import { attr } from '../../aura-utils/decorators';

import { AuraRoute, RouteViewCache } from '../../aura-route/core';
import { configureRouteContentLoader } from '../../aura-route/core/route-content-loader';
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
  ContentCache,
  ContentLoadService,
  ContentResolver,
  defaultLoaderRegistry,
  isCatchAllRoute,
  type AuraRoutingEngineConfig,
  type HistoryAction,
  type NavigateHistoryOptions,
  type PrefetchOptions,
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
  /** LRU cache for route content payloads (prefetch + navigation). */
  contentCache?: CacheStoreOptions<string>;
  /** Fallback 404 handler (когда нет `<aura-route path="*">`). Перекрывает not-found-template. */
  notFoundHandler?: NotFoundHandler | null;
}

export type { RouterInstance } from '../../aura-route-hooks/core';

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  private static contentCacheOptions: CacheStoreOptions<string> = {};

  /** Fallback template id — когда нет `<aura-route path="*">`. */
  @attr({ readonly: true, cached: true }) notFoundTemplate: string;
  @attr({ dataAttr: true, defaultValue: '[data-router-link]' })
  linksSelector: string;

  private engine?: AuraRoutingEngine;
  private readonly notFound = new AuraRouterNotFoundController(this);
  private readonly contentCache = new ContentCache(AuraRouter.contentCacheOptions);
  private readonly loaderRegistry = defaultLoaderRegistry;
  private contentLoadService?: ContentLoadService;

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
    if (options.contentCache) {
      AuraRouter.contentCacheOptions = options.contentCache;
    }
  }

  static registerLoader(type: string, loaderClass: LoaderConstructor): void {
    ContentLoaderRegistry.register(type, loaderClass);
  }

  /** Per-instance override (перекрывает configure и template). Только fallback. */
  setNotFoundHandler(handler: NotFoundHandler | null): void {
    this.notFound.setHandler(handler);
    this.ensureEngine().setNotFoundHandler((url) => this.notFound.handle(url));
  }

  get contentLoad(): ContentLoadService {
    if (!this.contentLoadService) {
      this.contentLoadService = new ContentLoadService({
        resolver: new ContentResolver({
          registry: this.loaderRegistry,
          cache: this.contentCache,
        }),
      });
    }
    return this.contentLoadService;
  }

  get routes() {
    return this.querySelectorAll<AuraRoute>(AuraRoute.is);
  }

  get appOutlet(): AuraOutlet {
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
      const config: AuraRoutingEngineConfig = {
        linksSelector: this.linksSelector,
        contentLoad: this.contentLoad,
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
        new AuraRoutingProcessor(),
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

  /** Programmatic prefetch for a target href. */
  prefetch(href: string, options?: PrefetchOptions): Promise<void> {
    return this.ensureEngine().prefetch(href, options);
  }

  /** @deprecated Use {@link prefetch}. */
  preload(href: string, options?: PrefetchOptions): Promise<void> {
    return this.prefetch(href, options);
  }
}
