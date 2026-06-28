import type { CacheStoreOptions } from '../../aura-cache-store/core';
import {
  ContentLoaderRegistry,
  type LoaderConstructor,
} from '../../aura-content-loaders/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRoute, RouteViewCache } from '../../aura-route/core';
import {
  AuraRoutingEngine,
  AuraRoutingProcessor,
  ContentCache,
  ContentLoadService,
  ContentResolver,
  defaultLoaderRegistry,
  defaultHookRegistry,
  isCatchAllRoute,
  type AuraRoutingEngineConfig,
  type HistoryAction,
  type NavigateHistoryOptions,
  type PrefetchOptions,
  type RouteHookDefinition,
  type RouterInstance,
} from '../../aura-routing-engine/core';
import { attr } from '../../aura-utils/decorators';

import { AuraRouterNotFoundController } from './aura-router-not-found-controller';
import { registerAuraRouterComponents } from './aura-router-setup';
import {
  dispatchNavigationError,
  dispatchNavigationHookError,
  dispatchNotFound,
  type NotFoundHandler,
} from './navigation-events';

export {
  AURA_ROUTER_NOT_FOUND,
  type NotFoundHandler,
  type NotFoundSource,
  type AuraRouterNotFoundEventDetail,
  type AuraRouterNotFoundEvent,
} from './navigation-events';

export {
  AURA_ROUTER_NAVIGATION_ERROR,
  type AuraRouterNavigationErrorEventDetail,
  type AuraRouterNavigationErrorEvent,
  type NavigationErrorPhase,
  type NavigationFailureCode,
} from './navigation-events';

export {
  AURA_ROUTER_NAVIGATION_HOOK_ERROR,
  type AuraRouterNavigationHookErrorEventDetail,
  type AuraRouterNavigationHookErrorEvent,
} from './navigation-events';

export interface AuraRouterConfigureOptions {
  /** LRU cache for keep-alive route views (`detachedRoot` DOM). */
  viewCache?: CacheStoreOptions<ViewRoot>;
  /** LRU cache for route content payloads (prefetch + navigation). */
  contentCache?: CacheStoreOptions<string>;
  /** Fallback 404 handler (когда нет `<aura-route path="*">`). Перекрывает not-found-template. */
  notFoundHandler?: NotFoundHandler | null;
}

export type { RouterInstance } from '../../aura-routing-engine/core';

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

  static install(): void {
    registerAuraRouterComponents();
  }

  /** Registers a global hook shared by all default AuraRouter instances. */
  static use(hook: RouteHookDefinition, options?: Record<string, unknown>): void {
    defaultHookRegistry.register(hook, options ?? {});
  }

  /** Removes a globally registered hook by name. Returns true when it existed. */
  static unuse(name: string): boolean {
    return defaultHookRegistry.unregister(name);
  }

  static configure(options: AuraRouterConfigureOptions): void {
    if ('notFoundHandler' in options) {
      AuraRouterNotFoundController.configure(options.notFoundHandler);
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
    this.ensureEngine().setNotFoundHandler((url) => {
      this.notFound.recover(url);
    });
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
    void customElements.whenDefined(AuraRoute.is).then(() => {
      if (!this.isConnected) return;
      this.refreshRoutes();
      this.ensureEngine().start();
    });
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
        onNotFound: (failure) => dispatchNotFound(this, failure.href, 'fallback'),
        onNavigationCommitted: (to) => {
          this.notFound.hide();
          if (isCatchAllRoute(to.pattern)) {
            dispatchNotFound(this, to.href, 'route');
          }
        },
        onNavigationError: (failure) => {
          if (failure.viewCommitted) {
            this.notFound.hide();
          }
          dispatchNavigationError(this, failure);
        },
        onNavigationHookError: (detail) => {
          dispatchNavigationHookError(this, detail);
        },
      };
      this.engine = new AuraRoutingEngine(
        new AuraRoutingProcessor(defaultHookRegistry),
        this,
        config,
      );
      this.engine.setNotFoundHandler((url) => {
        this.notFound.recover(url);
      });
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
