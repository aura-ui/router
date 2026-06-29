import type { CacheStoreOptions } from '../../aura-cache-store/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRoute, RouteViewCache } from '../../aura-route/core';
import {
  AuraRoutingEngine,
  AuraRoutingProcessor,
  ContentCache,
  ContentLoadService,
  defaultLoaderRegistry,
  defaultHookRegistry,
  isCatchAllRoute,
  parseScrollPolicy,
  type AuraRoutingEngineConfig,
  type HistoryAction,
  type LoaderFn,
  type LoaderType,
  type NavigateHistoryOptions,
  type PrefetchOptions,
  type RouteHookDefinition,
  type RouterInstance,
  type ScrollPolicy,
} from '../../aura-routing-engine/core';
import { attr } from '../../aura-utils/decorators';

import { AuraRouterNotFoundController } from './aura-router-not-found-controller';
import { registerAuraRouterComponents } from './aura-router-setup';
import { ScrollRestoration } from './scroll-restoration';
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
  /** Default scroll policy for child routes (`restore` | `top` | `manual`). HTML attr: `scroll`. */
  @attr({ parser: parseScrollPolicy, cached: true, name: 'scroll' }) scrollPolicy: ScrollPolicy | null;

  private engine?: AuraRoutingEngine;
  private readonly scrollRestoration = new ScrollRestoration();
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

  /** Registers a custom content loader on the shared {@link defaultLoaderRegistry}. */
  static registerLoader(type: LoaderType, loader: LoaderFn): void {
    defaultLoaderRegistry.register(type, loader);
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
        registry: this.loaderRegistry,
        cache: this.contentCache,
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
    this.scrollRestoration.clear();
    this.notFound.reset();
  }

  private ensureEngine(): AuraRoutingEngine {
    if (!this.engine) {
      const config: AuraRoutingEngineConfig = {
        linksSelector: this.linksSelector,
        contentLoad: this.contentLoad,
        onNotFound: (failure) => dispatchNotFound(this, failure.href, 'fallback'),
        onNavigationCommitted: (ctx) => {
          this.notFound.hide();
          if (isCatchAllRoute(ctx.to.pattern)) {
            dispatchNotFound(this, ctx.to.href, 'route');
          }
          this.scrollRestoration.handleCommit(ctx);
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
