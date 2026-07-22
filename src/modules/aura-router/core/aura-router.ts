import type { CacheStoreOptions } from '../../aura-cache-store/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRoute, RouteDomCache, type ViewResolverPort } from '../../aura-route/core';
import { parseMountStrategyAttr, type MountStrategy } from '../../aura-route/core/attr/mount-strategy-attr-parser';
import { parsePrefetchAttr, type PrefetchType } from '../../aura-route/core/attr/prefetch-attr-parser';
import { parseScrollAttr, type ScrollAttr } from '../../aura-route/core/attr/scroll-attr-parser';
import {
  AuraRoutingEngine,
  ViewGraph,
  DataGraph,
  defaultLoaderRegistry,
  defaultHookRegistry,
  resolvePrefetchEngineConfig,
  type LoaderFn,
  type LoaderId,
  type RegisterLoaderOptions,
  type NavigateHistoryOptions,
  type PrefetchOptions,
  type RouteHookDefinition,
  type RouterInvalidateOptions,
  type RouterInstance,
  type DataGraphCacheOptions,
  type Loader,
  type MatchedRouteInfo,
} from '../../aura-routing-engine/core';
import {
  syncRouterHostActiveLinks,
  toActiveRouteBranch,
  type ActiveRouteBranchEntry,
} from '../../aura-routing-engine/core/link-active';
import { attr } from '../../aura-utils/decorators';
import { memoize } from '../../aura-utils/decorators/memoize';
import { parseNullableString } from '../../aura-utils/misc';

import { AuraRouterNotFoundController } from './not-found-controller';
import { installAuraRouter } from './install';
import { connectRouterEngine } from './engine-bridge';
import { dispatchDataInvalidated, type NotFoundHandler } from './navigation-events';
import { ScrollRestoration } from './scroll-restoration';
import { resolveAppOutlet } from './outlet-resolver';

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

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  /** Fallback template id — когда нет `<aura-route path="*">`. */
  @attr({ readonly: true, cached: true })
  notFoundTemplate: string;

  @attr({ defaultValue: '[aura-router-link]' })
  linksSelector: string;
  /** CSS class toggled on `[aura-router-link]` when its resolved href matches the current URL. */
  @attr({ parser: parseNullableString, cached: true })
  linkActiveClass: string | null;
  /** CSS class for section/folder links when the current URL is under the link path (prefix match). */
  @attr({
    parser: parseNullableString,
    cached: true,
  }) linkActiveBranchClass: string | null;
  /** Optional ancestor that narrows the active-link scan (default: whole document). */
  @attr({
    parser: parseNullableString,
    cached: true,
  }) linksContainerSelector: string | null;

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
  /**
   * Optional CSS selector for the root `<aura-outlet>`.
   * When unset: previous/next sibling → nested `querySelector` → auto-create sibling.
   */
  @attr({ parser: parseNullableString, cached: true, name: 'outlet' })
  outletSelector: string | null;

  private engine?: AuraRoutingEngine;
  private readonly scrollRestoration = new ScrollRestoration();
  private readonly notFound = new AuraRouterNotFoundController(this);
  private _activeRouteBranch: ActiveRouteBranchEntry[] = [];

  /** Active branch root → leaf after the last settled navigation. */
  get activeRouteBranch(): readonly ActiveRouteBranchEntry[] {
    return this._activeRouteBranch;
  }

  static install(): void {
    installAuraRouter();
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
  static registerLoader(id: LoaderId, fn: LoaderFn, options?: RegisterLoaderOptions): void {
    defaultLoaderRegistry.register(id, fn, options);
  }

  static getLoader(id: LoaderId): Loader {
    return defaultLoaderRegistry.get(id);
  }

  /** Per-instance override (перекрывает configure и template). Только fallback. */
  setNotFoundHandler(handler: NotFoundHandler | null): void {
    this.notFound.setHandler(handler);
  }

  /** @internal Used by AuraRoute / RouteViewController. Not a supported app API. */
  resolveViewPort(): ViewResolverPort {
    return this.ensureEngine().viewGraph;
  }

  get routes() {
    return this.querySelectorAll<AuraRoute>(AuraRoute.is);
  }

  /**
   * Root view outlet for fallback 404 / top-level mounts.
   * Resolve order: `outlet` attr → prev/next sibling → nested `<aura-outlet>` → create sibling.
   */
  @memoize()
  get appOutlet(): AuraOutlet {
    return resolveAppOutlet(this);
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
    this._activeRouteBranch = [];
    memoize.clear(this, 'appOutlet');
    this.scrollRestoration.clear();
    this.notFound.clear();
  }

  private ensureEngine(): AuraRoutingEngine {
    if (!this.engine) {
      const { config, onEvent } = connectRouterEngine(this, {
        notFound: this.notFound,
        scrollRestoration: this.scrollRestoration,
        syncNavState: (to) => this.syncNavState(to),
        onHashOnlyNavigation: (href) => this.applyHashOnlyNavigation(href),
      });
      this.engine = new AuraRoutingEngine(this, {
        linksSelector: this.linksSelector,
        prefetch: resolvePrefetchEngineConfig(this.prefetchDomAttr),
        ...config,
      });
      this.engine.events.subscribe(onEvent);
    }
    return this.engine;
  }

  refreshRoutes(): void {
    this.ensureEngine().replaceRoutes(Array.from(this.routes));
  }

  /** Branch + active-link classes after url-align / commit (via engine bridge). */
  private syncNavState(to: MatchedRouteInfo): void {
    this._activeRouteBranch = toActiveRouteBranch(to.chain ?? [to]);
    this.syncActiveLinks(to.href);
  }

  /** Hash-only shortcut: keep patterns, rewrite hrefs, refresh active links. */
  private applyHashOnlyNavigation(href: string): void {
    if (this._activeRouteBranch.length) {
      this._activeRouteBranch = this._activeRouteBranch.map((e) => ({ pattern: e.pattern, href }));
    }
    this.syncActiveLinks(href);
  }

  private syncActiveLinks(href: string): void {
    syncRouterHostActiveLinks(this, href, {
      linksSelector: this.linksSelector,
      linkActiveClass: this.linkActiveClass,
      linkActiveBranchClass: this.linkActiveBranchClass,
      linksContainerSelector: this.linksContainerSelector,
    });
  }

  navigate(path: string, options: Partial<NavigateHistoryOptions> = {}): void {
    const replace = options.replace ?? false;
    void this.ensureEngine().navigateTo(path, replace ? 'replace' : 'push', {
      replace,
      syncHistory: options.syncHistory ?? true,
    });
  }

  /** Programmatic prefetch for a target href. */
  prefetch(href: string, options?: PrefetchOptions): Promise<void> {
    return this.ensureEngine().prefetch(href, options);
  }

  /**
   * Invalidates a resource cache (`options.cache`: `'data'` default | `'view'` | `'all'`).
   * Dispatches `data-invalidated` when data is included (`'data'` / `'all'`).
   * (`-1` = full invalidate, empty cache).
   */
  invalidate(options?: RouterInvalidateOptions): number {
    const count = this.ensureEngine().invalidate(options);
    if (options?.cache !== 'view') {
      dispatchDataInvalidated(this, count);
    }
    return count;
  }
}
