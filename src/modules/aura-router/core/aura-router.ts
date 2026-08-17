import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { AuraRoute, RouteDomCache } from '../../aura-route/core';
import { parseMountStrategyAttr } from '../../aura-route/core/attr/mount-strategy-attr-parser';
import { parsePrefetchAttr } from '../../aura-route/core/attr/prefetch-attr-parser';
import { parseOffableString } from '../../aura-route/core/attr/inherit-attr-parser';
import { parseScrollAttr } from '../../aura-route/core/attr/scroll-attr-parser';
import { parseScrollBehaviorAttr } from '../../aura-route/core/attr/scroll-behavior-attr-parser';
import {
  AuraRoutingEngine,
  ViewGraph,
  DataGraph,
  defaultLoaderRegistry,
  defaultHookRegistry,
  defineRouteHook,
  resolvePrefetchEngineConfig,
} from '../../aura-routing-engine/core';
import { syncRouterActiveLinks, toActiveRouteBranch } from '../../aura-routing-engine/core/link-active';
import { attr } from '../../aura-utils/decorators';
import { memoize } from '../../aura-utils/decorators/memoize';
import { parseNullableString } from '../../aura-utils/misc';
import { installAuraRouter } from './install';
import { resolveAppOutlet } from './outlet-resolver';
import { AURA_ROUTER_DATA_INVALIDATED, emit } from './navigation-events';
import { connectRouterEngine } from './engine-bridge';
import { AuraRouterNotFoundController } from './not-found-controller';
import { Scroller } from './scroller';
import type { SwrCacheOptions } from '../../aura-cache/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import type { ViewResolverPort } from '../../aura-route/core';
import type { MountStrategy } from '../../aura-route/core/attr/mount-strategy-attr-parser';
import type { PrefetchType } from '../../aura-route/core/attr/prefetch-attr-parser';
import type { ScrollAttr } from '../../aura-route/core/attr/scroll-attr-parser';
import type { ScrollBehaviorAttr } from '../../aura-route/core/attr/scroll-behavior-attr-parser';
import type {
  DataGraphCacheOptions,
  Loader,
  LoaderFn,
  LoaderId,
  MatchedRouteInfo,
  NavigateHistoryOptions,
  PrefetchOptions,
  RegisterLoaderOptions,
  RouteHookDefinition,
  RouteHookHandler,
  RouterInvalidateOptions,
  RouterInstance,
} from '../../aura-routing-engine/core';
import type { ActiveRouteBranchEntry } from '../../aura-routing-engine/core/link-active';
import type { NotFoundHandler } from './navigation-events';

/** Boolean marker: nested layout shell to adopt when it differs from `extract`. */
export const AURA_ROUTER_SSR_ATTR = 'aura-router-ssr';

export interface AuraRouterConfigureOptions {
  /** Detached DOM keep-alive (`cache.dom`). */
  domCache?: SwrCacheOptions<ViewRoot>;
  /** View-loader payload strings (`cache.view`). */
  viewCache?: SwrCacheOptions<string>;
  /** Load-hook payloads (`cache.data`). */
  dataCache?: DataGraphCacheOptions;
  /** Fallback 404 handler (когда нет `<aura-route path="*">`). Перекрывает error-template. */
  notFoundHandler?: NotFoundHandler | null;
}

/**
 * Host custom element: attrs / chrome here; matching & navigation in {@link AuraRoutingEngine}.
 */
export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  /**
   * Optional CSS selector for the root `<aura-outlet>`.
   * When unset: first `<aura-outlet>` in the document → auto-create sibling before host.
   */
  @attr({ parser: parseNullableString, cached: true, name: 'outlet' })
  outletSelector: string | null;

  /**
   * Default `<template>` id for route `error-template` inheritance.
   * Also used as thin fallback UI when there is no `<aura-route path="*">`.
   */
  @attr({ readonly: true, cached: true })
  errorTemplate: string;

  /** Default for route `loading-template` inheritance. */
  @attr({ readonly: true, cached: true })
  loadingTemplate: string;

  /** Default for route `loading-body-class` inheritance. */
  @attr({ readonly: true, cached: true })
  loadingBodyClass: string;

  /** Default for route `loading-start-event` inheritance. */
  @attr({ readonly: true, cached: true })
  loadingStartEvent: string;

  /** Default for route `loading-end-event` inheritance. */
  @attr({ readonly: true, cached: true })
  loadingEndEvent: string;

  @attr({ defaultValue: '[aura-router-link]' })
  linksSelector: string;

  /** Optional ancestor that narrows the active-link scan (default: whole document). */
  @attr({ parser: parseNullableString, cached: true })
  linksContainerSelector: string | null;

  /** CSS class toggled on `[aura-router-link]` when its resolved href matches the current URL. */
  @attr({ parser: parseNullableString, cached: true })
  linkActiveClass: string | null;

  /** CSS class for section/folder links when the current URL is under the link path (prefix match). */
  @attr({ parser: parseNullableString, cached: true })
  linkActiveBranchClass: string | null;

  /**
   * Default scroll policy for child routes (`auto` | `top`; default `auto`).
   * `scroll="none"` opts out. HTML attr: `scroll`.
   */
  @attr({ parser: parseScrollAttr, cached: true, name: 'scroll' })
  scrollPolicy: ScrollAttr | null;

  /**
   * Default scroll animation for child routes (`smooth` | `instant` | `auto`; default `auto`).
   * HTML attr: `scroll-behavior`.
   */
  @attr({ parser: parseScrollBehaviorAttr, cached: true })
  scrollBehavior: ScrollBehaviorAttr | null;

  /** Default CSS selector: SPA `url` fragment + flat first-paint adopt when no `aura-router-ssr`. */
  @attr({ parser: parseNullableString, cached: true })
  extract: string | null;

  /** Default document title template for child routes. HTML attr: `meta-title`. */
  @attr({ parser: parseOffableString, cached: true })
  metaTitle: string | null;

  /** Default description meta template for child routes. HTML attr: `meta-description`. */
  @attr({ parser: parseOffableString, cached: true })
  metaDescription: string | null;

  /**
   * Default prefetch for `[aura-router-link]` (`intent` | `tap` | `false`).
   * Per-link override: `data-prefetch` on `<a>`.
   */
  @attr({ parser: parsePrefetchAttr, cached: true, name: 'prefetch' })
  prefetchDomAttr: PrefetchType | false | null;

  /** Default enter-branch mount strategy for child routes (`branch` | `full`). */
  @attr({ parser: parseMountStrategyAttr, cached: true })
  mountStrategy: MountStrategy;

  private engine?: AuraRoutingEngine;
  private readonly scroller = new Scroller();
  private readonly notFound = new AuraRouterNotFoundController(this);
  private _activeRouteBranch: ActiveRouteBranchEntry[] = [];

  /**
   * Matched branch root → leaf.
   * Also refreshed on url-align / nav-state-restore (not only after commit).
   */
  get activeRouteBranch(): readonly ActiveRouteBranchEntry[] {
    return this._activeRouteBranch;
  }

  /** All descendant `<aura-route>` nodes (`querySelectorAll`, not only direct children). */
  get routes() {
    return this.querySelectorAll<AuraRoute>(AuraRoute.is);
  }

  /**
   * Outlet for fallback 404 / top-level mounts.
   * Resolve order: `outlet` attr → first `<aura-outlet>` in document → create sibling before host.
   */
  @memoize()
  get appOutlet(): AuraOutlet {
    return resolveAppOutlet(this);
  }

  /**
   * First-paint `[aura-router-ssr]` shell when present (nested layouts).
   * Flat pages omit it — {@link hydrate} adopts via the matched leaf `extract`.
   */
  private get ssrView(): HTMLElement | null {
    const selector = `[${AURA_ROUTER_SSR_ATTR}]`;
    return (
      this.appOutlet.querySelector<HTMLElement>(selector) ??
      document.querySelector<HTMLElement>(selector)
    );
  }

  /** Also registers `<aura-outlet>` and `<aura-route>`. */
  static install(): void {
    installAuraRouter();
  }

  static configure(options: AuraRouterConfigureOptions): void {
    if (options.domCache) {
      RouteDomCache.configure(options.domCache);
    }
    if (options.viewCache) {
      ViewGraph.configure(options.viewCache);
    }
    if (options.dataCache) {
      DataGraph.configure(options.dataCache);
    }
    if ('notFoundHandler' in options) {
      AuraRouterNotFoundController.configure(options.notFoundHandler);
    }
  }

  /**
   * Process-wide hook via {@link defaultHookRegistry} — shared by all default engine instances.
   *
   * @example
   * ```ts
   * AuraRouter.use('auth', async (ctx) => {
   *   if (!ok) return { type: 'redirect', url: '/login' };
   * });
   * AuraRouter.use(authHook, { redirect: '/signin' });
   * ```
   */
  static use(name: string, fn: RouteHookHandler, options?: Record<string, unknown>): void;
  static use(hook: RouteHookDefinition, options?: Record<string, unknown>): void;
  static use(hookOrName: string | RouteHookDefinition, fnOrOptions?: RouteHookHandler | Record<string, unknown>, options?: Record<string, unknown>): void {
    if (typeof hookOrName === 'string') {
      defaultHookRegistry.register(defineRouteHook(hookOrName, fnOrOptions as RouteHookHandler), options ?? {});
      return;
    }
    defaultHookRegistry.register(hookOrName, (fnOrOptions as Record<string, unknown>) ?? {});
  }

  /** @returns `true` if a hook with that name was registered */
  static unuse(name: string): boolean {
    return defaultHookRegistry.unregister(name);
  }

  /** Custom view loader on the shared {@link defaultLoaderRegistry}. */
  static registerLoader(id: LoaderId, fn: LoaderFn, options?: RegisterLoaderOptions): void {
    defaultLoaderRegistry.register(id, fn, options);
  }

  /** @throws if `id` is unknown */
  static getLoader(id: LoaderId): Loader {
    return defaultLoaderRegistry.get(id);
  }

  connectedCallback(): void {
    const engine = this.ensureEngine();
    if (engine.isRunning) engine.stop();

    void customElements.whenDefined(AuraRoute.is).then(async () => {
      if (!this.isConnected) return;
      this.refreshRoutes();
      const leaf = await this.ensureEngine().bootstrap(this.ssrView, this.appOutlet);
      if (leaf) this.syncBranchAndActiveLinks(leaf.href, leaf);
    });
  }

  disconnectedCallback(): void {
    this.engine?.destroy();
    this.engine = undefined;
    this._activeRouteBranch = [];
    memoize.clear(this, 'appOutlet');
    this.scroller.clear();
    this.notFound.clear();
  }

  /** Defaults: `replace: false` → history `push`; `syncHistory: true`. */
  navigate(path: string, options: Partial<NavigateHistoryOptions> = {}): void {
    const replace = options.replace ?? false;
    void this.ensureEngine().navigateTo(path, replace ? 'replace' : 'push', {
      replace,
      syncHistory: options.syncHistory ?? true,
    });
  }

  prefetch(href: string, options?: PrefetchOptions): Promise<void> {
    return this.ensureEngine().prefetch(href, options);
  }

  /**
   * Dispatches `data-invalidated` unless `options.cache === 'view'`.
   * @returns affected count; `-1` if a full invalidate hit an empty cache
   */
  invalidate(options?: RouterInvalidateOptions): number {
    const count = this.ensureEngine().invalidate(options);
    if (options?.cache !== 'view') {
      emit(this, AURA_ROUTER_DATA_INVALIDATED, { count });
    }
    return count;
  }

  refreshRoutes(): void {
    this.ensureEngine().replaceRoutes(Array.from(this.routes));
  }

  /** Per-instance override (перекрывает configure и `error-template`). Только fallback. */
  setNotFoundHandler(handler: NotFoundHandler | null): void {
    this.notFound.setHandler(handler);
  }

  /** @internal Used by AuraRoute / RouteViewController. Not a supported app API. */
  resolveViewPort(): ViewResolverPort {
    return this.ensureEngine().viewGraph;
  }

  private ensureEngine(): AuraRoutingEngine {
    if (!this.engine) {
      const { config, onEvent } = connectRouterEngine(this, {
        syncBranchAndActiveLinks: (href, to) =>
          this.syncBranchAndActiveLinks(href, to),
        scroller: this.scroller,
        notFound: this.notFound,
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

  private syncBranchAndActiveLinks(href: string, to: MatchedRouteInfo | null = null): void {
    this._activeRouteBranch = to ? toActiveRouteBranch(to.chain ?? [to]) : [];
    this.syncActiveLinks(href);
  }

  /** Keep patterns, rewrite hrefs, refresh active links. */
  private applyHashOnlyNavigation(href: string): void {
    if (this._activeRouteBranch.length) {
      this._activeRouteBranch = this._activeRouteBranch.map((e) => ({
        pattern: e.pattern,
        href,
      }));
    }
    this.syncActiveLinks(href);
  }

  /**
   * No-op when both active classes are unset.
   * Scan root: `linksContainerSelector` → `closest` (else this host); otherwise `ownerDocument`.
   */
  private syncActiveLinks(href: string): void {
    const { linkActiveClass, linkActiveBranchClass } = this;
    if (!linkActiveClass && !linkActiveBranchClass) return;

    syncRouterActiveLinks({
      container: this.linksContainerSelector
        ? (this.closest(this.linksContainerSelector) ?? this)
        : this.ownerDocument!,
      linksSelector: this.linksSelector,
      linkActiveClass: linkActiveClass ?? undefined,
      linkActiveBranchClass: linkActiveBranchClass ?? undefined,
      currentHref: href,
    });
  }
}
