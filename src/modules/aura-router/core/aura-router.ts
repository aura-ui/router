import type { CacheStoreOptions } from '../../aura-cache-store/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRoute, RouteDomCache } from '../../aura-route/core';
import { parseMountStrategyAttr, type MountStrategy } from '../../aura-route/core/attr/mount-strategy-attr-parser';
import { parsePrefetchAttr, type PrefetchType } from '../../aura-route/core/attr/prefetch-attr-parser';
import { parseScrollAttr, type ScrollAttr } from '../../aura-route/core/attr/scroll-attr-parser';
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
  type DataGraphCacheOptions,
  type Loader,
  type EventBus,
  type EngineEvent,
} from '../../aura-routing-engine/core';
import {
  syncRouterHostActiveLinks,
  toRouteTrail,
  type RouteTrailEntry,
} from '../../aura-routing-engine/core/link-active';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { attr } from '../../aura-utils/decorators';
import { parseNullableString } from '../../aura-utils/misc';

import { AuraRouterNotFoundController } from './aura-router-not-found-controller';
import { registerAuraRouterComponents } from './aura-router-setup';
import {
  dispatchNavigationError,
  dispatchNavigationHookError,
  dispatchNavigationCommitted,
  dispatchNavigationComplete,
  dispatchNavigationCancel,
  dispatchNavigationRedirect,
  dispatchNavigationStart,
  dispatchLoadStart,
  dispatchLoadEnd,
  dispatchLoadError,
  dispatchNotFound,
  dispatchDataInvalidated,
  type NotFoundHandler,
} from './navigation-events';
import { ScrollRestoration } from './scroll-restoration';
import { memoize } from '../../aura-utils/decorators/memoize';

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
  AURA_ROUTER_NAVIGATION_COMPLETE,
  AURA_ROUTER_NAVIGATION_CANCEL,
  AURA_ROUTER_NAVIGATION_REDIRECT,
  type AuraRouterNavigationEventDetail,
  type AuraRouterNavigationEvent,
  type AuraRouterNavigationStartEvent,
  type AuraRouterNavigationCompleteEventDetail,
  type AuraRouterNavigationCompleteEvent,
  type AuraRouterNavigationCancelEventDetail,
  type AuraRouterNavigationCancelEvent,
  type AuraRouterNavigationRedirectEventDetail,
  type AuraRouterNavigationRedirectEvent,
} from './navigation-events';

export {
  AURA_ROUTER_LOAD_START,
  AURA_ROUTER_LOAD_END,
  AURA_ROUTER_LOAD_ERROR,
  type AuraRouterLoadEventDetail,
  type AuraRouterLoadStartEvent,
  type AuraRouterLoadEndEvent,
  type AuraRouterLoadErrorEventDetail,
  type AuraRouterLoadErrorEvent,
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
  dataCache?: DataGraphCacheOptions;
  /** Fallback 404 handler (когда нет `<aura-route path="*">`). Перекрывает not-found-template. */
  notFoundHandler?: NotFoundHandler | null;
}

export type { RouterInstance } from '../../aura-routing-engine/core';
export type { RouteTrailEntry } from '../../aura-routing-engine/core/link-active';

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  /** Fallback template id — когда нет `<aura-route path="*">`. */
  @attr({ readonly: true, cached: true }) notFoundTemplate: string;

  @attr({ defaultValue: '[aura-router-link]' }) linksSelector: string;
  /** CSS class toggled on `[aura-router-link]` when its resolved href matches the current URL. */
  @attr({ parser: parseNullableString, cached: true, name: 'link-active-class' }) linkActiveClass: string | null;
  /** CSS class for section/folder links when the current URL is under the link path (prefix match). */
  @attr({ parser: parseNullableString, cached: true, name: 'link-active-branch-class' }) linkActiveBranchClass: string | null;
  /** Optional ancestor that narrows the active-link scan (default: whole document). */
  @attr({ parser: parseNullableString, cached: true, name: 'links-container-selector' }) linksContainerSelector: string | null;

  /** Default scroll policy for child routes (`restore` | `top`; `scroll="none"` opts out). HTML attr: `scroll`. */
  @attr({ parser: parseScrollAttr, cached: true, name: 'scroll' }) scrollPolicy: ScrollAttr | null;
  /** Default CSS selector for `url` fragment extract on child routes (`extract="none"` opts out). */
  @attr({ parser: parseNullableString, cached: true }) extract: string | null;
  /**
   * Default prefetch for `[aura-router-link]` (`intent` | `tap` | `false`).
   * Per-link override: `data-prefetch` on `<a>`.
   */
  @attr({ parser: parsePrefetchAttr, cached: true, name: 'prefetch' })
  prefetchDomAttr: PrefetchType | false | null;
  /** Default enter-branch mount strategy for child routes (`branch` | `full`). */
  @attr({ parser: parseMountStrategyAttr, cached: true }) mountStrategy: MountStrategy;

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

  @memoize()
  get appOutlet(): AuraOutlet {
    let outlet = document.querySelector(AuraOutlet.is) as AuraOutlet | null;
    if (!outlet) {
      outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
      this.parentNode?.insertBefore(outlet, this);
    }
    return outlet;
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
        onHashOnlyNavigation: (href) => {
          if (this._trail.length) {
            this._trail = this._trail.map((e) => ({ pattern: e.pattern, href }));
          }
          this.syncActiveLinks(href);
        },
        onNavigationHookError: (detail) => {
          dispatchNavigationHookError(this, detail);
        },
      };
      this.engine = new AuraRoutingEngine(this, config);
      this.engine.setNotFoundHandler((url) => {
        this.notFound.recover(url);
      });
      this.engine.events.subscribe((event) => this.onEngineEvent(event));
    }
    return this.engine;
  }

  /**
   * Host chrome adapter over the engine event stream.
   * Early: `url-aligned` → active links / `navigation-start`.
   * Stay: `nav-state-restore` → active links / trail after cancel-pending.
   * Loads: `load:*` → `load-start` / `load-end` / `load-error`.
   * Late: `commit:end` → scroll, not-found, active links again, DOM `navigation`.
   * Terminal: `finish` / `cancel` / `redirect` / `error` → DOM counterparts.
   */
  private onEngineEvent(event: EngineEvent): void {
    if (event.type === 'navigation:url-aligned') {
      dispatchNavigationStart(this, {
        from: event.from?.pathname ?? null,
        to: event.to.href,
        pathname: event.to.pathname,
      });
      this.syncNavState(event.to);
      return;
    }

    if (event.type === 'navigation:nav-state-restore') {
      this.syncNavState(event.to);
      return;
    }

    if (event.type === 'load:start') {
      dispatchLoadStart(this, event.id, event.nodeId, event.pattern);
      return;
    }

    if (event.type === 'load:end') {
      dispatchLoadEnd(this, event.id, event.nodeId, event.pattern);
      return;
    }

    if (event.type === 'load:error') {
      dispatchLoadError(this, event.id, event.nodeId, event.pattern, event.error);
      return;
    }

    if (event.type === 'navigation:commit:end') {
      this.notFound.hide();
      if (isCatchAllRoutePattern(event.to.pattern)) {
        dispatchNotFound(this, event.to.href, 'route');
      }
      this.scrollRestoration.handleCommit({
        from: event.from,
        to: event.to,
        action: event.action,
        hash: event.hash,
      });
      dispatchNavigationCommitted(this, {
        from: event.from?.pathname ?? null,
        to: event.to.href,
        pathname: event.to.pathname,
      });
      this.syncNavState(event.to);
      return;
    }

    if (event.type === 'navigation:finish') {
      dispatchNavigationComplete(this, event.id);
      return;
    }

    if (event.type === 'navigation:cancel') {
      dispatchNavigationCancel(this, event.id, event.reason);
      return;
    }

    if (event.type === 'navigation:redirect') {
      dispatchNavigationRedirect(this, event.id, event.url, event.replace);
      return;
    }

    if (event.type === 'navigation:error') {
      if (event.failure.viewCommitted) {
        this.notFound.hide();
      }
      // NOT_FOUND already surfaces as DOM `not-found` via engine `onNotFound`.
      if (event.failure.isNotFound) {
        return;
      }
      dispatchNavigationError(this, event.failure);
    }
  }

  refreshRoutes(): void {
    this.ensureEngine().replaceRoutes(Array.from(this.routes));
  }

  /**
   * Trail + active-link classes for the target href.
   * Called from {@link onEngineEvent} on `url-aligned` and again on `commit:end`.
   */
  private syncNavState(to: MatchedRouteInfo): void {
    this._trail = toRouteTrail(to.chain ?? [to]);
    this.syncActiveLinks(to.href);
  }

  private syncActiveLinks(href: string): void {
    syncRouterHostActiveLinks(this, href, {
      linksSelector: this.linksSelector,
      linkActiveClass: this.linkActiveClass,
      linkActiveBranchClass: this.linkActiveBranchClass,
      linksContainerSelector: this.linksContainerSelector,
    });
  }

  /** Engine event stream (`navigation:url-aligned`, `navigation:commit:end`, …). */
  get events(): EventBus {
    return this.ensureEngine().events;
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
