import type { CacheStoreOptions } from '../../aura-cache-store/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRoute, RouteDomCache } from '../../aura-route/core';
import {
  AuraRoutingEngine,
  ViewGraph,
  DataGraph,
  defaultLoaderRegistry,
  defaultHookRegistry,
  isCatchAllRoutePattern,
  resolvePrefetchEngineConfig,
  type AuraRoutingEngineConfig,
  type HistoryAction,
  type LoaderFn,
  type LoaderId,
  type NavigateHistoryOptions,
  type PrefetchOptions,
  type RouteHookDefinition,
  type RouterDataInvalidateOptions,
  type ViewInvalidateOptions,
  type RouterInstance,
  type DataGraphOptions,
  type Loader,
} from '../../aura-routing-engine/core';
import { attr } from '../../aura-utils/decorators';

import { AuraRouterNotFoundController } from './aura-router-not-found-controller';
import { registerAuraRouterComponents } from './aura-router-setup';
import { ScrollRestoration } from './scroll-restoration';
import {
  dispatchNavigationError,
  dispatchNavigationHookError,
  dispatchNavigationCommitted,
  dispatchNavigationStart,
  dispatchNotFound,
  dispatchDataInvalidated,
  type NotFoundHandler,
} from './navigation-events';
import { parseMountStrategyAttr, type MountStrategy } from '../../aura-route/core/attr/mount-strategy-attr-parser';
import { parsePrefetchAttr, type PrefetchType } from '../../aura-route/core/attr/prefetch-attr-parser';
import { parseScrollAttr, type ScrollAttr } from '../../aura-route/core/attr/scroll-attr-parser';
import { parseNullableString } from '../../aura-utils/misc';
import {
  syncRouterHostActiveLinks,
  toRouteTrail,
  type RouteTrailEntry,
} from '../../aura-routing-engine/core/link-active';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';

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

export {
  AURA_ROUTER_NAVIGATION,
  AURA_ROUTER_NAVIGATION_START,
  type AuraRouterNavigationEventDetail,
  type AuraRouterNavigationEvent,
  type AuraRouterNavigationStartEvent,
} from './navigation-events';

export {
  AURA_ROUTER_DATA_INVALIDATED,
  type AuraRouterDataInvalidatedEventDetail,
  type AuraRouterDataInvalidatedEvent,
} from './navigation-events';

export interface AuraRouterConfigureOptions {
  /** Detached DOM keep-alive (`cache.dom`). */
  domCache?: CacheStoreOptions<ViewRoot>;
  /** View-loader payload strings (`cache.view`). */
  viewCache?: CacheStoreOptions<string>;
  /** Load-hook payloads (`cache.data`). */
  dataCache?: DataGraphOptions;
  /** Fallback 404 handler (когда нет `<aura-route path="*">`). Перекрывает not-found-template. */
  notFoundHandler?: NotFoundHandler | null;
}

export type { RouterInstance } from '../../aura-routing-engine/core';
export type { RouteTrailEntry } from '../../aura-routing-engine/core/link-active';

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  /** Fallback template id — когда нет `<aura-route path="*">`. */
  @attr({ readonly: true, cached: true }) notFoundTemplate: string;
  @attr({ dataAttr: true, defaultValue: '[data-router-link]' })
  linksSelector: string;
  /** CSS class toggled on `[data-router-link]` when its resolved href matches the current URL. */
  @attr({ dataAttr: true, parser: parseNullableString, cached: true, name: 'router-active-class' })
  exactActiveClass: string | null;
  /** CSS class for section/folder links when the current URL is under the link path (prefix match). */
  @attr({ dataAttr: true, parser: parseNullableString, cached: true, name: 'branch-active-class' })
  prefixActiveClass: string | null;
  /** Ancestor selector for active-link scan when nav is outside router (demo: `.demo-site`). */
  @attr({ dataAttr: true, parser: parseNullableString, cached: true, name: 'router-link-root' })
  activeLinkScope: string | null;
  /** Default scroll policy for child routes (`restore` | `top`; `scroll="none"` opts out). HTML attr: `scroll`. */
  @attr({ parser: parseScrollAttr, cached: true, name: 'scroll' }) scrollPolicy: ScrollAttr | null;
  /** Default CSS selector for `url` fragment extract on child routes (`extract="none"` opts out). */
  @attr({ parser: parseNullableString, cached: true }) extract: string | null;
  /**
   * Default prefetch for `[data-router-link]` (`intent` | `tap` | `false`).
   * Per-link override: `data-prefetch` on `<a>`.
   */
  @attr({ parser: parsePrefetchAttr, cached: true, name: 'prefetch' })
  prefetchDomAttr: PrefetchType | false | null;
  /** Default enter-branch mount strategy for child routes (`branch` | `full`). */
  @attr({ parser: parseMountStrategyAttr, cached: true }) mountStrategy: MountStrategy | null;

  private engine?: AuraRoutingEngine;
  private readonly scrollRestoration = new ScrollRestoration();
  private readonly notFound = new AuraRouterNotFoundController(this);
  private _trail: RouteTrailEntry[] = [];

  /** Active branch root → leaf after the last settled navigation. */
  get trail(): readonly RouteTrailEntry[] {
    return this._trail;
  }

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
    if (options.domCache) {
      RouteDomCache.configure(options.domCache);
    }
    if (options.viewCache) {
      ViewGraph.configure(options.viewCache);
    }
    if (options.dataCache) {
      DataGraph.configure(options.dataCache);
    }
  }

  /** Registers a custom content loader on the shared {@link defaultLoaderRegistry}. */
  static registerLoader(id: LoaderId, fn: LoaderFn, options?: any): void {
    defaultLoaderRegistry.register(id, fn, options);
  }

  static getLoader(id: LoaderId): Loader {
    return defaultLoaderRegistry.get(id);
  }

  /** Per-instance override (перекрывает configure и template). Только fallback. */
  setNotFoundHandler(handler: NotFoundHandler | null): void {
    this.notFound.setHandler(handler);
    this.ensureEngine().setNotFoundHandler((url) => {
      this.notFound.recover(url);
    });
  }

  /** Facade to the engine-owned {@link ViewGraph} (creates engine on first access). */
  get viewGraph(): ViewGraph {
    return this.ensureEngine().viewGraph;
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
        prefetch: resolvePrefetchEngineConfig(this.prefetchDomAttr),
        onNotFound: (failure) => dispatchNotFound(this, failure.href, 'fallback'),
        onNavigationHistoryCommitted: (ctx) => {
          dispatchNavigationStart(this, {
            from: ctx.from?.pathname ?? null,
            to: ctx.to.href,
            pathname: ctx.to.pathname,
          });
          this.syncNavState(ctx.to);
        },
        onNavigationCommitted: (ctx) => {
          this.notFound.hide();
          if (isCatchAllRoutePattern(ctx.to.pattern)) {
            dispatchNotFound(this, ctx.to.href, 'route');
          }
          this.scrollRestoration.handleCommit(ctx);
          dispatchNavigationCommitted(this, {
            from: ctx.from?.pathname ?? null,
            to: ctx.to.href,
            pathname: ctx.to.pathname,
          });
          this.syncNavState(ctx.to);
        },
        onAnchorNavigation: (href) => {
          if (this._trail.length) {
            this._trail = this._trail.map((e) => ({ pattern: e.pattern, href }));
          }
          this.syncActiveLinks(href);
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
      this.engine = new AuraRoutingEngine(this, config);
      this.engine.setNotFoundHandler((url) => {
        this.notFound.recover(url);
      });
    }
    return this.engine;
  }

  refreshRoutes(): void {
    this.ensureEngine().replaceRoutes(Array.from(this.routes));
  }

  private syncNavState(to: MatchedRouteInfo): void {
    this._trail = toRouteTrail(to.chain ?? [to]);
    this.syncActiveLinks(to.href);
  }

  private syncActiveLinks(href: string): void {
    syncRouterHostActiveLinks(this, href, {
      linksSelector: this.linksSelector,
      exactActiveClass: this.exactActiveClass,
      prefixActiveClass: this.prefixActiveClass,
      scopeSelector: this.activeLinkScope,
    });
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

  /**
   * Invalidates load-hook cache entries ({@link DataGraph}).
   * Dispatches `data-invalidated` with the number of affected entries (`-1` = full invalidate, empty cache).
   */
  invalidate(options?: RouterDataInvalidateOptions): number {
    const count = this.ensureEngine().invalidateData(options);
    dispatchDataInvalidated(this, count);
    return count;
  }

  /**
   * Invalidates view-loader payload cache ({@link ViewGraph}).
   * Does not affect load-hook data; use {@link invalidate} for that.
   */
  invalidateView(options?: ViewInvalidateOptions): number {
    return this.ensureEngine().invalidateView(options);
  }
}
