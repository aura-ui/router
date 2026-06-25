import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';
import type { AuraRouteInterface } from '../aura-route';
import type { AuraOutlet, ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import { getTemplate } from '../../../aura-utils/misc';
import { RouteRenderSignal } from './render-signal';

import {
  commitStagedMount,
  EMPTY_ROUTE_MOUNT,
  finalizeLeaveMount,
  hasActiveMount,
  mergeMountResult,
  mountRoute,
  reattachRoute,
  rollbackStagedMount,
  toViewMountState,
  unmountMountOnLeave,
  type RouteMountSnapshot,
  type ViewMountContext,
  type ViewMountState,
} from './outlet-adapter';
import { resolveErrorViewPayload, warnMissingLayoutOutlet } from './route-error-view';
import { type RouteViewCachePort } from './view-cache';
import { viewCacheKey } from './view-cache-key';
import type { RouteContentPort, RouteRenderOptions, RouteViewKind } from './view-controller.types';

export type { RouteContentPort, RouteRenderOptions } from './view-controller.types';

const EMPTY_CONTENT_HTML = '<div>No content to display</div>';

/**
 * View state and render orchestration for {@link AuraRoute}.
 * Outlet policy lives in {@link outlet-adapter}; stage lifecycle calls {@link AuraOutlet} directly.
 * Content loading is injected via {@link RouteContentPort}.
 */
export class AuraRouteViewController {
  private readonly route: AuraRouteInterface;
  private readonly content: RouteContentPort;
  private readonly renderSignal = new RouteRenderSignal();
  private readonly viewCache: RouteViewCachePort;
  private readonly getAppOutlet: () => AuraOutlet;
  private readonly getMountOutlet: (routeInfo?: MatchedRouteInfo) => AuraOutlet | null;
  private readonly getLifecycleToken: () => number;

  private mount: RouteMountSnapshot = { ...EMPTY_ROUTE_MOUNT };
  /** Set at {@link render} commit; used by {@link onLeft} keep-alive stash. */
  private lastCacheKey: string | null = null;

  /** Public read surface for nested layout outlets (see {@link AuraRoute#nestedOutlet}). */
  get nestedOutlet(): AuraOutlet | null {
    return this.mount.nestedOutlet;
  }

  constructor(
    route: AuraRouteInterface,
    content: RouteContentPort,
    viewCache: RouteViewCachePort,
    getAppOutlet: () => AuraOutlet,
    getMountOutlet: (routeInfo?: MatchedRouteInfo) => AuraOutlet | null,
    getLifecycleToken: () => number = () => 0,
  ) {
    this.route = route;
    this.content = content;
    this.viewCache = viewCache;
    this.getAppOutlet = getAppOutlet;
    this.getMountOutlet = getMountOutlet;
    this.getLifecycleToken = getLifecycleToken;
  }

  // --- Public: signal & cancellation ---

  get signal(): AbortSignal {
    return this.renderSignal.signal;
  }

  cancel(): void {
    this.renderSignal.cancel();
  }

  cancelPendingRender(): void {
    this.mount = rollbackStagedMount(this.mount);
    this.renderSignal.cancel();
  }

  async preload(): Promise<void> {
    await this.content.preload?.(this.renderSignal.signal);
  }

  // --- Public: render pipeline ---

  async render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    const { signal } = options ?? {};
    const token = this.getLifecycleToken();
    const viewKind = viewKindOf(this.route);

    try {
      this.renderSignal.begin(signal);
      this.lastCacheKey = this.cacheKey(routeInfo);

      if (this.tryRestoreFromCache(token, routeInfo, viewKind)) return;
      if (this.shouldKeepActiveMount(viewKind)) return;

      await this.renderFresh(token, routeInfo, viewKind);
    } catch (error) {
      if (this.isRenderStale(token)) return;
      this.showRenderError(token, error, routeInfo);
      throw error;
    }
  }

  // --- Public: route lifecycle ---

  /**
   * Promotes a staged incoming view to the sole active root in the outlet.
   * No-op unless the last render used outlet `stage`. Called by the engine via
   * `commitEnterViews` after transition hooks, before exit `onLeft`.
   */
  commitStagedView(): void {
    this.mount = commitStagedMount(this.mount);
  }

  onLeft(): void {
    this.renderSignal.cancel();

    const { keepAlive } = this.route;
    const { state, detached } = unmountMountOnLeave(this.mount, keepAlive);
    this.mount = finalizeLeaveMount(state, keepAlive, detached);

    if (keepAlive && detached) {
      this.viewCache.put(this.lastCacheKey ?? this.route.path, detached);
    }
  }

  // --- Private: token guards ---

  private isTokenCurrent(token: number): boolean {
    return this.getLifecycleToken() === token;
  }

  private isRenderStale(token: number): boolean {
    return this.renderSignal.aborted || !this.isTokenCurrent(token);
  }

  // --- Private: render pipeline ---

  private shouldKeepActiveMount(viewKind: RouteViewKind): boolean {
    return this.route.keepAlive
      && hasActiveMount(viewKind === 'layout', toViewMountState(this.mount));
  }

  private async renderFresh(
    token: number,
    routeInfo: MatchedRouteInfo,
    viewKind: RouteViewKind,
  ): Promise<void> {
    const { loadingTemplate } = this.route;

    // TODO: body className and loading event
    if (loadingTemplate) {
      this.mountPayload(token, getTemplate(loadingTemplate), routeInfo, viewKind);
    }

    const payload = await this.resolvePayload(viewKind, routeInfo);
    if (this.isRenderStale(token)) return;

    if (payload == null) {
      if (viewKind === 'content') {
        this.mountPayload(token, EMPTY_CONTENT_HTML, routeInfo, 'content');
      }
      return;
    }

    this.mountPayload(token, payload, routeInfo, viewKind);
  }

  // --- Private: keep-alive cache ---

  private tryRestoreFromCache(token: number, routeInfo: MatchedRouteInfo, viewKind: RouteViewKind): boolean {
    if (!this.route.keepAlive) return false;

    const cached = this.viewCache.extract(this.cacheKey(routeInfo));
    if (!cached) return false;

    this.reattachCachedView(token, cached, routeInfo, viewKind);
    return true;
  }

  private cacheKey(routeInfo: MatchedRouteInfo): string {
    return viewCacheKey(routeInfo, this.route.path);
  }

  // --- Private: outlet mount ---

  /** Staged crossfade when route inherits a non-empty `data-transition`. */
  private get stageMount(): boolean {
    return !!this.route.transition?.trim();
  }

  private buildMountContext(routeInfo?: MatchedRouteInfo): ViewMountContext {
    return {
      pattern: routeInfo?.pattern,
      appOutlet: this.getAppOutlet(),
      mountOutlet: this.getMountOutlet(routeInfo),
      signal: this.renderSignal.signal,
      stageMount: this.stageMount,
    };
  }

  private applyMount(
    token: number,
    routeInfo: MatchedRouteInfo | undefined,
    viewKind: RouteViewKind,
    mount: () => ViewMountState | null,
  ): void {
    if (!this.isTokenCurrent(token)) return;

    const result = mount();
    if (!result) return;

    this.mount = mergeMountResult(this.mount, result);
    warnMissingLayoutOutlet(this.route, viewKind, result);
  }

  private mountPayload(
    token: number,
    payload: Node | string,
    routeInfo: MatchedRouteInfo | undefined,
    viewKind: RouteViewKind,
  ): void {
    this.applyMount(token, routeInfo, viewKind, () =>
      mountRoute(this.buildMountContext(routeInfo), payload, toViewMountState(this.mount)),
    );
  }

  private reattachCachedView(
    token: number,
    content: ViewRoot,
    routeInfo: MatchedRouteInfo,
    viewKind: RouteViewKind,
  ): void {
    this.applyMount(token, routeInfo, viewKind, () =>
      reattachRoute(this.buildMountContext(routeInfo), content),
    );
  }

  // --- Private: content resolution ---

  private async resolvePayload(
    viewKind: RouteViewKind,
    routeInfo: MatchedRouteInfo,
  ): Promise<Node | string | null> {
    if (viewKind === 'layout') {
      return getTemplate(this.route.layout!);
    }

    const cached = this.content.readCache?.(routeInfo);
    if (cached) return cached;

    const payload = await this.content.resolve(routeInfo, this.renderSignal.signal);
    if (payload) {
      this.content.writeCache?.(routeInfo, payload);
    }

    return payload;
  }

  // --- Private: errors ---

  private showRenderError(token: number, error: unknown, routeInfo: MatchedRouteInfo): void {
    this.mountPayload(token, resolveErrorViewPayload(this.route, error), routeInfo, 'content');
  }
}

function viewKindOf(route: AuraRouteInterface): RouteViewKind {
  return route.layout ? 'layout' : 'content';
}
