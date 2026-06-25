import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';
import type { AuraRouteInterface } from '../aura-route';
import type { AuraOutlet, OutletStrategy, ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import { getTemplate } from '../../../aura-utils/misc';
import { RouteRenderSignal } from './render-signal';

import {
  mountRoute,
  reattachRoute,
  shouldSkipRouteRender,
  unmountRoute,
  type ViewMountContext,
  type ViewMountState,
} from './outlet-adapter';
import { type RouteViewCachePort } from './view-cache';
import { viewCacheKey } from './view-cache-key';
import type { RouteContentPort, RouteRenderOptions, RouteViewKind } from './view-controller.types';

export type { RouteContentPort, RouteRenderOptions } from './view-controller.types';

type PlaceViewInput = {
  token: number;
  payload: Node | string;
  routeInfo?: MatchedRouteInfo;
  viewKind: RouteViewKind;
};

type RouteLastMount = {
  strategy: Extract<OutletStrategy, 'replace' | 'stage'>;
  handle: ViewMountState['activeHandle'];
};

const EMPTY_ROUTE_LAST_MOUNT: RouteLastMount = { strategy: 'replace', handle: null };

/**
 * View state and render orchestration for {@link AuraRoute}.
 * Outlet policy lives in {@link outlet-adapter}; stage lifecycle calls {@link AuraOutlet} directly.
 * Content loading is injected via {@link RouteContentPort}.
 */
export class AuraRouteViewController {
  private readonly route: AuraRouteInterface;
  private readonly content: RouteContentPort;
  private readonly renderSignal: RouteRenderSignal;
  private readonly viewCache: RouteViewCachePort;
  private readonly getDefaultOutlet: () => AuraOutlet;
  private readonly getParentOutlet: (routeInfo?: MatchedRouteInfo) => AuraOutlet | null;
  private readonly getLifecycleToken: () => number;

  private lastMount: RouteLastMount = { ...EMPTY_ROUTE_LAST_MOUNT };
  /** Outgoing view kept alive while `lastMount.strategy === 'stage'`. */
  private stageOutgoingHandle: ViewMountState['activeHandle'] = null;
  /** Set at {@link render} commit; used by {@link onLeft} keep-alive stash. */
  private lastCacheKey: string | null = null;

  /** Nested `<aura-outlet>` inside mounted layout; children render here. */
  childOutlet: AuraOutlet | null = null;

  constructor(
    route: AuraRouteInterface,
    content: RouteContentPort,
    viewCache: RouteViewCachePort,
    getDefaultOutlet: () => AuraOutlet,
    getParentOutlet: (routeInfo?: MatchedRouteInfo) => AuraOutlet | null,
    getLifecycleToken: () => number = () => 0,
  ) {
    this.route = route;
    this.content = content;
    this.viewCache = viewCache;
    this.getDefaultOutlet = getDefaultOutlet;
    this.getParentOutlet = getParentOutlet;
    this.getLifecycleToken = getLifecycleToken;
    this.renderSignal = new RouteRenderSignal();
  }

  // --- Public: signal & cancellation ---

  get signal(): AbortSignal {
    return this.renderSignal.signal;
  }

  cancel(): void {
    this.renderSignal.cancel();
  }

  cancelPendingRender(): void {
    this.cancelStagedMount();
    this.renderSignal.cancel();
  }

  async preload(): Promise<void> {
    await this.content.preload?.(this.renderSignal.signal);
  }

  // --- Public: render pipeline ---

  async render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    const { signal } = options ?? {};
    const token = this.getLifecycleToken();
    const config = this.route;
    const viewKind = viewKindOf(config);

    try {
      this.renderSignal.begin(signal);
      this.lastCacheKey = this.cacheKey(routeInfo);

      if (this.tryRestoreFromCache(token, routeInfo, viewKind)) return;
      if (shouldSkipRouteRender(config.keepAlive, viewKind === 'layout', this.currentMountState())) return;

      //todo think about body classname and event
      if (config.loadingTemplate) {
        this.placeView({
          token,
          payload: getTemplate(config.loadingTemplate),
          routeInfo,
          viewKind,
        });
      }

      const payload = await this.resolvePayload(viewKind, routeInfo);
      if (this.renderSignal.aborted || !this.isTokenCurrent(token)) return;

      if (viewKind === 'content' && !payload) {
        this.placeView({
          token,
          payload: '<div>No content to display</div>',
          routeInfo,
          viewKind: 'content',
        });
        return;
      }

      this.placeView({
        token,
        payload: payload as Node | string,
        routeInfo,
        viewKind,
      });
    } catch (error) {
      if (this.renderSignal.aborted || !this.isTokenCurrent(token)) return;
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
    if (this.lastMount.strategy !== 'stage' || !this.lastMount.handle) return;
    this.lastMount.handle.mountOutlet.commitStage(this.lastMount.handle.viewRoot);
    this.lastMount.strategy = 'replace';
    this.stageOutgoingHandle = null;
  }

  onLeft(): void {
    this.renderSignal.cancel();

    const config = this.route;
    let detached: ViewRoot | null = null;

    if (this.lastMount.strategy === 'stage') {
      this.dropStagedView();
      detached = unmountRoute(this.stageOutgoingHandle, config.keepAlive);
      this.stageOutgoingHandle = null;
    } else {
      detached = unmountRoute(this.lastMount.handle, config.keepAlive);
    }

    this.lastMount.handle = null;

    if (config.keepAlive && detached) {
      this.viewCache.put(this.lastCacheKey ?? this.route.path, detached);
    } else {
      this.childOutlet = null;
    }
  }

  // --- Private: token guards ---

  private isTokenCurrent(token: number): boolean {
    return this.getLifecycleToken() === token;
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

  private currentMountState(): ViewMountState {
    return {
      activeHandle: this.lastMount.handle,
      childOutlet: this.childOutlet,
    };
  }

  private buildMountContext(routeInfo?: MatchedRouteInfo): ViewMountContext {
    return {
      pattern: routeInfo?.pattern,
      defaultOutlet: this.getDefaultOutlet(),
      parentOutlet: this.getParentOutlet(routeInfo),
      signal: this.renderSignal.signal,
      stageMount: this.stageMount,
    };
  }

  private placeView(data: PlaceViewInput): void {
    if (!this.isTokenCurrent(data.token)) return;

    const result = mountRoute(
      this.buildMountContext(data.routeInfo),
      data.payload,
      this.currentMountState(),
    );

    this.applyMountResult(result, data.viewKind);
  }

  private reattachCachedView(token: number, content: ViewRoot, routeInfo: MatchedRouteInfo, viewKind: RouteViewKind): void {
    if (!this.isTokenCurrent(token)) return;
    const result = reattachRoute(this.buildMountContext(routeInfo), content);
    if (!result) return;
    this.applyMountResult(result, viewKind);
  }

  private applyMountResult(result: ViewMountState, viewKind: RouteViewKind): void {
    if (result.appliedStrategy === 'stage') {
      this.stageOutgoingHandle = this.lastMount.handle;
    } else {
      this.stageOutgoingHandle = null;
    }

    this.lastMount = {
      strategy: result.appliedStrategy ?? 'replace',
      handle: result.activeHandle,
    };
    this.childOutlet = result.childOutlet;

    if (viewKind === 'layout' && !result.childOutlet) {
      console.warn(
        `AuraRoute layout "${this.route.layout}" (path: ${this.route.path}) has no <aura-outlet>`,
      );
    }
  }

  /** Cancel pending stage and restore `stageOutgoingHandle` as `lastMount.handle`. */
  private cancelStagedMount(): void {
    if (this.lastMount.strategy !== 'stage' || !this.lastMount.handle) return;
    this.dropStagedView();

    if (this.stageOutgoingHandle) {
      this.lastMount.handle = this.stageOutgoingHandle;
      this.childOutlet = this.stageOutgoingHandle.findChildOutlet();
      this.stageOutgoingHandle = null;
    } else {
      this.lastMount.handle = null;
      this.childOutlet = null;
    }
  }

  /** Remove staged DOM only; does not restore controller handles (used when leaving the route). */
  private dropStagedView(): void {
    if (this.lastMount.strategy !== 'stage' || !this.lastMount.handle) return;
    this.lastMount.handle.mountOutlet.cancelStage();
    this.lastMount.strategy = 'replace';
  }

  // --- Private: content resolution ---

  private async resolvePayload(
    viewKind: RouteViewKind,
    routeInfo: MatchedRouteInfo,
  ): Promise<Node | string | null> {
    const config = this.route;

    if (viewKind === 'layout') {
      return getTemplate(config.layout!);
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

  private showRenderError(
    token: number,
    error: unknown,
    routeInfo: MatchedRouteInfo,
  ): void {
    const config = this.route;

    if (config.errorTemplate) {
      try {
        this.placeView({
          token,
          payload: getTemplate(config.errorTemplate),
          routeInfo,
          viewKind: 'content',
        });
        return;
      } catch (templateError) {
        console.warn(`Failed to render errorTemplate for route "${config.path}":`, templateError);
      }
    }

    this.showFallbackError(token, error);
  }

  private showFallbackError(token: number, error: unknown): void {
    console.error(`Error rendering AuraRoute (path: ${this.route.path}):`, error);

    const message = escapeHtml(error instanceof Error ? error.message : 'Error loading content');
    const stackTrace = escapeHtml(error instanceof Error ? error.stack ?? '' : '');

    this.placeView({
      token,
      payload: `<div class="aura-route-error">
      <h2>Content Loading Error</h2>
      <p>${message}</p>
      ${stackTrace ? `<pre class="error-stack">${stackTrace}</pre>` : ''}
    </div>`,
      viewKind: 'content',
    });
  }
}

function viewKindOf(route: AuraRouteInterface): RouteViewKind {
  return route.layout ? 'layout' : 'content';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
