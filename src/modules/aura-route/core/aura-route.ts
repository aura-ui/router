import { AuraRouter } from '../../aura-router/core/aura-router';
import { routeAttr } from '../../aura-utils/decorators';
import { memoize } from '../../aura-utils/decorators/memoize';
import { dispatchCustomEvent, getTemplate } from '../../aura-utils/misc';
import { parseCacheAttr } from './attr/cache-attr-parser';
import { parseHookList, parseOffableString } from './attr/inherit-attr-parser';
import { parseMountStrategyAttr } from './attr/mount-strategy-attr-parser';
import { parsePathAttr } from './attr/path-attr-parser';
import { parseParamChangeAttr } from './attr/param-change-attr-parser';
import { parsePrefetchAttr } from './attr/prefetch-attr-parser';
import { parseScrollAttr } from './attr/scroll-attr-parser';
import { parseScrollBehaviorAttr } from './attr/scroll-behavior-attr-parser';
import { parseCacheTimeAttr } from './attr/cache-time-attr-parser';
import {
  NO_TRANSITION,
  parseTransitionShortcutAttr,
} from './attr/transition-attr-parser';
import {
  DEFAULT_TRANSITION_ORDER,
  parseTransitionOrder,
} from './attr/transition-order-attr-parser';
import { isAsyncLoader, isSyncLoader, parseViewAttr } from './attr/view-attr-parser';
import { RouteViewController } from './view';
import { domCacheKey, defaultDomCache } from './view/dom-cache';
import type { AuraOutlet, ViewHandle } from '../../aura-outlet/core/aura-outlet';
import type {
  MatchedRouteInfo,
  RouteErrorContext,
  RouteInstance,
  RouteLifecycleContext,
  ViewRenderResult,
} from '../../aura-routing-engine/route-api';
import type { CacheFlags } from './attr/cache-attr-parser';
import type { MountStrategy } from './attr/mount-strategy-attr-parser';
import type { ParamChangePolicy } from './attr/param-change-attr-parser';
import type { PrefetchType } from './attr/prefetch-attr-parser';
import type { ScrollAttr } from './attr/scroll-attr-parser';
import type { ScrollBehaviorAttr } from './attr/scroll-behavior-attr-parser';
import type {
  RouteTransitionType,
  TransitionShortcutType,
} from './attr/transition-attr-parser';

import type { TransitionOrderType } from './attr/transition-order-attr-parser';
import type { ViewAttrDescriptor } from './attr/view-attr-parser';
import type {
  MountResolvedViewOptions,
  AuraRouteInterface,
  RouteRenderOptions,
  RouteType,
} from './types';
import type { MountTargetPort } from './view';

export type { AuraRouteInterface, RouteType };

/** Default `loading-start-event` name. */
export const AURA_ROUTE_LOADING_START = 'aura-route-loading';

/** Default `loading-end-event` name. */
export const AURA_ROUTE_LOADING_END = 'aura-route-loading-end';

let idCounter = 0;

export class AuraRoute extends HTMLElement implements AuraRouteInterface, RouteInstance {
  static is = 'aura-route';

  /** Attrs that feed {@link viewKeySuffix}; changes call {@link refresh}. */
  static get observedAttributes(): string[] {
    return ['layout', 'view', 'extract'];
  }

  @routeAttr({ inherit: false, parser: parsePathAttr })
  path: string;

  @routeAttr({ inherit: false })
  redirect: string;

  @routeAttr({ inherit: false, cached: false })
  layout: string;

  @routeAttr({ inherit: false, parser: parseViewAttr })
  view: ViewAttrDescriptor | null;

  @routeAttr({ parser: parseOffableString })
  extract: string | null;

  /** Document `<title>` (`:param` tokens like `view`). HTML attr: `meta-title`. Inherits from parent routes, not `<aura-router>`. */
  @routeAttr({ parser: parseOffableString, inheritFrom: 'aura-route' })
  metaTitle: string | null;

  /** Wraps the page title (`%s`). HTML attr: `meta-title-template`. */
  @routeAttr({ parser: parseOffableString })
  metaTitleTemplate: string | null;

  /** Document description meta (`:param` tokens). HTML attr: `meta-description`. Inherits from parent routes, not `<aura-router>`. */
  @routeAttr({ parser: parseOffableString, inheritFrom: 'aura-route' })
  metaDescription: string | null;

  /** Canonical link href (`:param` tokens). HTML attr: `meta-canonical`. Inherits from parent routes, not `<aura-router>`. */
  @routeAttr({ parser: parseOffableString, inheritFrom: 'aura-route' })
  metaCanonical: string | null;

  @routeAttr({ parser: parseOffableString })
  loadingTemplate: string | null;

  @routeAttr({ parser: parseOffableString })
  loadingBodyClass: string | null;

  @routeAttr({
    parser: parseOffableString,
    defaultValue: AURA_ROUTE_LOADING_START,
  })
  loadingStartEvent: string | null;

  @routeAttr({
    parser: parseOffableString,
    defaultValue: AURA_ROUTE_LOADING_END,
  })
  loadingEndEvent: string | null;

  @routeAttr({ parser: parseOffableString })
  errorTemplate: string | null;

  @routeAttr({ parser: parseHookList })
  leave: string[] | null;

  @routeAttr({ parser: parseHookList })
  guard: string[] | null;

  @routeAttr({ parser: parseHookList, inherit: false })
  load: string[] | null;

  @routeAttr({ parser: parseHookList })
  update: string[] | null;

  @routeAttr({ parser: parseTransitionShortcutAttr, name: 'transition' })
  transitionShortcut: TransitionShortcutType | null;

  @routeAttr({ parser: parseTransitionOrder })
  transitionOrder: TransitionOrderType | null;

  @routeAttr({ parser: parseHookList, name: 'transition-out' })
  transitionOutDecl: string[] | null;

  @routeAttr({ parser: parseHookList, name: 'transition-in' })
  transitionInDecl: string[] | null;

  @routeAttr({ parser: parseHookList })
  unmount: string[] | null;

  @routeAttr({ parser: parseHookList })
  ready: string[] | null;

  @routeAttr({ parser: parseHookList })
  error: string[] | null;

  @routeAttr({ parser: parseParamChangeAttr })
  paramChange: ParamChangePolicy | null;

  @routeAttr({ parser: parseScrollAttr, name: 'scroll' })
  scrollPolicy: ScrollAttr | null;

  /** CSS selector for post-nav scroll; `none` opts out. HTML attr: `scroll-target`. */
  @routeAttr({ parser: parseOffableString })
  scrollTarget: string | null;

  /** Native scroll animation (`smooth` | `instant` | `auto`). HTML attr: `scroll-behavior`. */
  @routeAttr({ parser: parseScrollBehaviorAttr })
  scrollBehavior: ScrollBehaviorAttr | null;

  @routeAttr({ parser: parsePrefetchAttr })
  prefetch: PrefetchType | false | null;

  @routeAttr({ parser: parseMountStrategyAttr })
  mountStrategy: MountStrategy;

  @routeAttr({ parser: parseCacheAttr })
  cache: CacheFlags;

  /** Per-entry long-cache `gcTime` (sec). `null` when attr absent → store default. */
  @routeAttr({ parser: parseCacheTimeAttr })
  cacheTime: number | null;

  /**
   * Per-entry long-cache `staleTime` (sec). `null` when attr absent → store default.
   * Unused on current Data/View nav `get`/`set` path (kept for future `resolve`).
   */
  @routeAttr({ parser: parseCacheTimeAttr })
  cacheRefresh: number | null;

  /** route unique id, not changed after reconnection, uses fast like key for some operations */
  readonly uid = ++idCounter;
  private viewController!: RouteViewController;
  private setupDone!: Promise<void>;
  private viewReady = false;
  private initGeneration = 0;
  private passId = 0;
  private loadingActive = false;
  /** True only after {@link showLoading} staged a `loading-template` (skipped when transition-order). */
  private loadingTemplateStaged = false;

  get nestedOutlet(): AuraOutlet | null {
    return this.viewController?.nestedOutlet ?? null;
  }

  /** @internal Used by hydrate engine */
  async whenReady(): Promise<void> {
    await this.setupDone;
  }

  /** @internal Used by hydrate engine — call after {@link whenReady}. */
  adopt(handle: ViewHandle, routeInfo: MatchedRouteInfo) {
    this.viewController.adopt(handle, routeInfo);
  }

  get type(): RouteType {
    if (this.redirect.trim()) return 'redirect';
    if (this.hasChildrenRoutes) return 'folder';
    return 'page';
  }

  get hasChildrenRoutes() {
    return this.querySelector(`:scope > ${AuraRoute.is}`);
  }

  get hasLayout(): boolean {
    return !!this.layout.trim();
  }

  get hasViewContent(): boolean {
    if (this.type === 'redirect') return false;
    if (this.type === 'folder') return this.hasLayout;
    return !!this.view;
  }

  get hasLeave(): boolean {
    return !!this.leave?.length;
  }

  get hasGuard(): boolean {
    return !!this.guard?.length;
  }

  get hasLoad(): boolean {
    return !!this.load?.length;
  }

  get hasUpdate(): boolean {
    return !!this.update?.length;
  }

  get hasTransitionIn(): boolean {
    return !!this.transitionIn;
  }

  get hasReady(): boolean {
    return !!this.transitionOut || !!this.ready?.length;
  }

  get hasAsyncContent(): boolean {
    if (this.hasLoad) return true;
    return isAsyncLoader(this.view?.loader);
  }

  /** Sync builtin view (`html` / `template` / `component`) without layout or async work. */
  get hasSyncContent(): boolean {
    if (this.type !== 'page' || this.hasLayout || this.hasAsyncContent) return false;
    return isSyncLoader(this.view?.loader);
  }

  get hasDataCache() {
    return this.cache.data;
  }

  get hasViewCache() {
    return this.cache.view;
  }

  get hasDomCache() {
    return this.cache.dom;
  }

  @memoize()
  get transition() {
    return this.initTransition();
  }

  get transitionIn(): string[] | null {
    return this.transition.in;
  }

  get transitionOut(): string[] | null {
    return this.transition.out;
  }

  /**
   * Suffix of `viewKey` / resource identity (`layout:template:…` / `view:…`).
   * Memoized; cleared in {@link refresh} when `layout` / `view` / `extract` change.
   */
  @memoize()
  get viewKeySuffix(): string | null {
    const layout = this.layout.trim();
    if (layout) return `layout:template:${layout}`;

    const view = this.view;
    if (!view?.loader || !view.content) return null;

    const slot = `view:${view.loader}:${view.content}`;
    return view.loader === 'url' && this.extract ? `${slot}::${this.extract}` : slot;
  }

  /**
   * Whether the view loader declares `needsData` (DataGraph payload in the cache key).
   * `undefined` when there is no view loader.
   */
  get viewLoaderNeedsData() {
    if (!this.view?.loader) return undefined;
    const loader = AuraRouter.getLoader(this.view?.loader);
    return (loader.constructor as { needsData?: boolean }).needsData || (loader as { needsData?: boolean }).needsData;
  }

  connectedCallback() {
    this.initGeneration++;
    const generation = this.initGeneration;
    this.viewReady = false;
    this.setupDone = this.init(generation);
  }

  disconnectedCallback(): void {
    this.passId++;
    this.initGeneration++;
    this.viewReady = false;
    if (this.loadingActive) this.hideLoading();
    this.viewController?.cancel();
  }

  protected attributeChangedCallback(_attrName: string, _oldVal: string, _newVal: string): void {
    this.refresh();
  }

  refresh() {
    routeAttr.clear(this);
    memoize.clear(this, ['transition', 'viewKeySuffix']);
  }

  resolveAndMountView(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<ViewRenderResult> {
    return this.setupDone.then(() => {
      this.throwIfInvalidAttrs();
      if (!this.hasViewContent) return { status: 'ok' };
      this.passId++;
      return this.viewController.resolveAndMountView(routeInfo, options);
    });
  }

  /** Sync branch-atomic mount — caller must finish branch resolve first. */
  mountResolvedView(
    routeInfo: MatchedRouteInfo,
    options: MountResolvedViewOptions,
  ): ViewRenderResult | 'aborted' {
    this.throwIfInvalidAttrs();
    // Path group / redirect-like: no DOM work; do not require viewController.
    if (!this.hasViewContent) return { status: 'ok' };
    if (!this.viewReady || !this.viewController) {
      return { status: 'error', error: new DOMException('AuraRoute not initialized', 'InvalidStateError') };
    }
    this.passId++;
    return this.viewController.mountResolvedView(routeInfo, options);
  }

  commitStagedView(): void {
    this.viewController?.commitStagedView();
  }

  revertInFlightView(): void {
    this.viewController?.revertInFlightView();
  }

  /** Validate route attrs for the detected {@link type}; throws on invalid combinations. */
  validateAttrs(): void {
    this.throwIfInvalidAttrs();
  }

  onLeave(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onGuard(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onLoad(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  /**
   * Prepare-window loading chrome: body class, start event, optional skeleton mount.
   * Called by the engine around `runLoads` (after guards → load end).
   *
   * `loading-template` is skipped when the route has a page transition — skeleton
   * would fight old→new animation; use `loading-body-class` / events instead.
   */
  showLoading(routeInfo: MatchedRouteInfo): void {
    if (this.loadingActive) return;
    this.loadingActive = true;

    if (this.loadingBodyClass) {
      document.body.classList.add(this.loadingBodyClass);
    }

    if (this.loadingStartEvent) {
      dispatchCustomEvent(this, this.loadingStartEvent, { detail: { routeInfo } });
    }

    // Keep previous page visible for transition; body class / events still run above.
    if (this.transition.order !== null) return;
    if (!this.loadingTemplate || !this.viewReady || !this.viewController) return;

    try {
      this.passId++;
      this.viewController.mountLoadingTemplate(routeInfo, getTemplate(this.loadingTemplate));
      this.loadingTemplateStaged = true;
    } catch (error) {
      console.warn(`Failed to render loadingTemplate for route "${this.path}":`, error);
    }
  }

  /** Clears body class, end event, and staged `loading-template` from {@link showLoading}. */
  hideLoading(): void {
    if (!this.loadingActive) return;
    this.loadingActive = false;

    // Only when skeleton was staged — update-path has no remount to clear it otherwise.
    if (this.loadingTemplateStaged) {
      this.loadingTemplateStaged = false;
      this.viewController?.revertInFlightView();
    }

    if (this.loadingBodyClass) {
      document.body.classList.remove(this.loadingBodyClass);
    }

    if (this.loadingEndEvent) {
      dispatchCustomEvent(this, this.loadingEndEvent);
    }
  }

  onUpdate(ctx: RouteLifecycleContext): void {
    void ctx;
    this.passId++;
  }

  onTransitionOut(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onTransitionIn(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onUnmount(ctx: RouteLifecycleContext): void {
    this.passId++;
    this.viewController?.onUnmount({ domCacheKey: domCacheKey(ctx.to, this.path) });
  }

  onReady(ctx: RouteLifecycleContext): void {
    void ctx;
  }

  onError(ctx: RouteErrorContext): void {
    void ctx;
  }

  /** Merges decl attrs with `transition` shortcut; `none`/`off`/`false` on decl opts out of inherited shortcut on that side. */
  initTransition(): RouteTransitionType {
    const inMerged = this.transitionInDecl ?? this.transitionShortcut?.in;
    const outMerged = this.transitionOutDecl ?? this.transitionShortcut?.out;
    const inHooks = inMerged?.length ? inMerged : null;
    const outHooks = outMerged?.length ? outMerged : null;
    if (!this.transitionOrder && !inHooks && !outHooks) return NO_TRANSITION;
    const order = this.transitionOrder ?? DEFAULT_TRANSITION_ORDER;
    return { order: order, in: inHooks, out: outHooks };
  }

  private async init(generation: number): Promise<void> {
    await customElements.whenDefined(AuraRouter.is);
    if (generation !== this.initGeneration || !this.isConnected) {
      throw new DOMException('AuraRoute init aborted', 'AbortError');
    }

    const router = this.closest(AuraRouter.is) as AuraRouter | null;
    if (!router) {
      throw new DOMException('aura-route should be inside aura-router', 'NotFoundError');
    }

    if (!this.path) throw new Error('AuraRoute must have a path attribute');

    const mountTarget: MountTargetPort = {
      appOutlet: () => router.appOutlet,
      nestedOutlet: (routeInfo) => routeInfo.node?.parent?.route.nestedOutlet ?? null,
    };

    this.viewController = new RouteViewController(
      {
        route: this,
        view: router.resolveViewPort(),
        cache: defaultDomCache,
        mountTarget,
      },
      () => this.passId,
    );
    this.viewReady = true;
  }

  private throwIfInvalidAttrs(): void {
    const path = this.path;
    if (this.type === 'redirect') {
      if (this.hasChildrenRoutes) {
        throw new Error(`AuraRoute redirect "${path}" cannot have nested child routes`);
      }
      if (this.view) throw new Error(`AuraRoute redirect "${path}" cannot declare view`);
      if (this.hasLayout) throw new Error(`AuraRoute redirect "${path}" cannot declare layout`);
      return;
    }
    if (this.type === 'folder') {
      if (this.view) {
        throw new Error(`AuraRoute folder "${path}" cannot declare view — use nested child routes`);
      }
      return;
    }
    if (!this.view) throw new Error(`AuraRoute page "${path}" has no view`);
  }
}
