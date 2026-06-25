import type { MatchedRouteInfo, RouteInfo } from '../../../aura-route-hooks/core';
import type { AuraRouteInterface } from '../aura-route';
import type { AuraOutlet, OutletStrategy, ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import { getTemplate } from '../../../aura-utils/misc';
import { RouteRenderSignal } from '../render-signal';

import {
  mountRoute,
  shouldSkipRouteRender,
  unmountRoute,
  type ViewMountContext,
  type ViewMountState,
} from './outlet-adapter';
import {
  defaultRouteViewCache,
  type RouteViewCachePort,
} from './view-cache';
import { viewCacheKey, type ViewCacheKeySource } from './view-cache-key';
import type {
  RouteContentPort,
  RouteOutletPort,
  RouteRenderOptions,
  RouteViewKind,
} from './view-controller.types';

export type {
  RouteContentPort,
  RouteOutletPort,
  RouteRenderOptions,
} from './view-controller.types';

type PlaceViewInput = {
  token: number;
  payload: Node | string;
  routeInfo?: MatchedRouteInfo;
  viewKind: RouteViewKind;
  stageMount?: boolean;
  pattern?: string;
  detachedRoot?: ViewRoot;
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
  private readonly renderSignal = new RouteRenderSignal();
  private readonly route: AuraRouteInterface;
  private readonly outlets: RouteOutletPort;
  private readonly content: RouteContentPort;
  private readonly viewCache: RouteViewCachePort;
  private readonly getLifecycleToken: () => number;

  private lastMount: RouteLastMount = { ...EMPTY_ROUTE_LAST_MOUNT };
  /** Outgoing view kept alive while `lastMount.strategy === 'stage'`. */
  private stageOutgoingHandle: ViewMountState['activeHandle'] = null;
  private lastCacheKey: string | null = null;

  /** Nested `<aura-outlet>` inside mounted layout; children render here. */
  childOutlet: AuraOutlet | null = null;

  constructor(
    route: AuraRouteInterface,
    outlets: RouteOutletPort,
    content: RouteContentPort,
    viewCache: RouteViewCachePort = defaultRouteViewCache,
    getLifecycleToken: () => number = () => 0,
  ) {
    this.route = route;
    this.outlets = outlets;
    this.content = content;
    this.viewCache = viewCache;
    this.getLifecycleToken = getLifecycleToken;
  }

  // --- Public: signal & cancellation ---

  get signal(): AbortSignal {
    return this.renderSignal.signal;
  }

  get aborted(): boolean {
    return this.renderSignal.aborted;
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

  async render(routeInfo?: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    const { signal, stageMount } = options ?? {};
    const token = this.getLifecycleToken();
    const config = this.route;
    const viewKind = viewKindOf(config);

    try {
      this.renderSignal.begin(signal);
      this.rememberCacheKey(routeInfo);
      if (!this.isTokenCurrent(token)) return;

      if (this.tryRestoreFromCache(token, routeInfo, viewKind, stageMount)) return;
      if (shouldSkipRouteRender(config.keepAlive, viewKind === 'layout', this.currentMountState())) return;

      if (config.loadingTemplate) {
        this.placeView({
          token,
          payload: getTemplate(config.loadingTemplate),
          routeInfo,
          viewKind,
          stageMount,
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
          stageMount,
        });
        return;
      }

      this.placeView({
        token,
        payload: payload as Node | string,
        routeInfo,
        viewKind,
        stageMount,
      });
    } catch (error) {
      if (this.renderSignal.aborted || !this.isTokenCurrent(token)) return;
      this.showRenderError(token, error, routeInfo, stageMount);
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

  onReenter(route: RouteInfo): void {
    if (!this.route.keepAlive) return;

    const cached = this.viewCache.extract(this.cacheKey(route));
    if (!cached) return;

    this.reattachFromCache(
      this.getLifecycleToken(),
      cached,
      undefined,
      viewKindOf(this.route),
      undefined,
      route.pathname,
    );
  }

  // --- Private: token guards ---

  private isTokenCurrent(token: number): boolean {
    return this.getLifecycleToken() === token;
  }

  // --- Private: keep-alive cache ---

  private tryRestoreFromCache(
    token: number,
    routeInfo: MatchedRouteInfo | undefined,
    viewKind: RouteViewKind,
    stageMount?: boolean,
  ): boolean {
    if (!this.route.keepAlive) return false;

    const cached = this.viewCache.extract(this.cacheKey(routeInfo));
    if (!cached) return false;

    this.reattachFromCache(token, cached, routeInfo, viewKind, stageMount);
    return true;
  }

  private cacheKey(source?: ViewCacheKeySource): string {
    return viewCacheKey(source, this.route.path);
  }

  private rememberCacheKey(source?: ViewCacheKeySource): void {
    if (source === undefined) return;
    this.lastCacheKey = this.cacheKey(source);
  }

  // --- Private: outlet mount ---

  private currentMountState(): ViewMountState {
    return {
      activeHandle: this.lastMount.handle,
      childOutlet: this.childOutlet,
      detachedRoot: null,
    };
  }

  private buildMountContext(
    routeInfo?: MatchedRouteInfo,
    stageMount?: boolean,
    pattern?: string,
  ): ViewMountContext {
    return {
      pattern: routeInfo?.pattern ?? pattern,
      defaultOutlet: this.outlets.getDefaultOutlet(),
      parentOutlet: this.outlets.parentOutlet(routeInfo),
      signal: this.renderSignal.signal,
      stageMount,
    };
  }

  private reattachFromCache(
    token: number,
    root: ViewRoot,
    routeInfo?: MatchedRouteInfo,
    viewKind: RouteViewKind = viewKindOf(this.route),
    stageMount?: boolean,
    pattern?: string,
  ): void {
    this.placeView({
      token,
      payload: root,
      routeInfo,
      viewKind,
      stageMount,
      pattern,
      detachedRoot: root,
    });
  }

  private placeView(input: PlaceViewInput): void {
    if (!this.isTokenCurrent(input.token)) return;

    const previous: ViewMountState = input.detachedRoot
      ? { activeHandle: null, childOutlet: null, detachedRoot: input.detachedRoot }
      : this.currentMountState();

    const result = mountRoute(
      this.buildMountContext(input.routeInfo, input.stageMount, input.pattern),
      input.payload,
      previous,
    );

    this.applyMountResult(result, input.viewKind);
    this.rememberCacheKey(input.routeInfo);
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
    routeInfo?: MatchedRouteInfo,
  ): Promise<Node | string | null> {
    const config = this.route;

    if (viewKind === 'layout') {
      return getTemplate(config.layout!);
    }

    const cached = this.content.readCache?.(routeInfo);
    if (cached) return cached;

    const payload = await this.content.resolve(routeInfo, this.renderSignal.signal);
    if (payload && routeInfo) {
      this.content.writeCache?.(routeInfo, payload);
    }

    return payload;
  }

  // --- Private: errors ---

  private showRenderError(
    token: number,
    error: unknown,
    routeInfo?: MatchedRouteInfo,
    stageMount?: boolean,
  ): void {
    const config = this.route;

    if (config.errorTemplate) {
      try {
        this.placeView({
          token,
          payload: getTemplate(config.errorTemplate),
          routeInfo,
          viewKind: 'content',
          stageMount,
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
    if (!this.isTokenCurrent(token)) return;

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
