import type { MatchedRouteInfo, RouteInfo } from '../../../aura-route-hooks/core';
import type { TransitionPolicy } from '../../../aura-routing-engine/core/transition/policy';
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
  RouteViewConfig,
  RouteViewKind,
} from './view-controller.types';

export type {
  AuraRouteViewHost,
  RouteContentPort,
  RouteOutletPort,
  RouteRenderOptions,
  RouteViewConfig,
} from './view-controller.types';

type PlaceViewInput = {
  token: number;
  payload: Node | string;
  routeInfo?: MatchedRouteInfo;
  viewKind: RouteViewKind;
  transitionPolicy?: TransitionPolicy;
  pattern?: string;
  detachedRoot?: ViewRoot;
};

/**
 * View state and render orchestration for {@link AuraRoute}.
 * Outlet policy lives in {@link outlet-adapter}; stage lifecycle calls {@link AuraOutlet} directly.
 * Content loading is injected via {@link RouteContentPort}.
 */
export class AuraRouteViewController {
  private readonly renderSignal = new RouteRenderSignal();
  private readonly getConfig: () => RouteViewConfig;
  private readonly outlets: RouteOutletPort;
  private readonly content: RouteContentPort;
  private readonly viewCache: RouteViewCachePort;
  private readonly getLifecycleToken: () => number;

  private activeHandle: ViewMountState['activeHandle'] = null;
  private lastMountStrategy: Extract<OutletStrategy, 'replace' | 'stage'> = 'replace';
  private lastCacheKey: string | null = null;

  /** Nested `<aura-outlet>` inside mounted layout; children render here. */
  childOutlet: AuraOutlet | null = null;

  constructor(
    getConfig: () => RouteViewConfig,
    outlets: RouteOutletPort,
    content: RouteContentPort,
    viewCache: RouteViewCachePort = defaultRouteViewCache,
    getLifecycleToken: () => number = () => 0,
  ) {
    this.getConfig = getConfig;
    this.outlets = outlets;
    this.content = content;
    this.viewCache = viewCache;
    this.getLifecycleToken = getLifecycleToken;
  }

  // --- Public: signal & cancellation ---

  private get config(): RouteViewConfig {
    return this.getConfig();
  }

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
    const { signal, transitionPolicy } = options ?? {};
    const token = this.getLifecycleToken();
    const config = this.config;
    const viewKind = viewKindOf(config);

    try {
      this.renderSignal.begin(signal);
      this.rememberCacheKey(routeInfo);
      if (!this.isTokenCurrent(token)) return;

      if (this.tryRestoreFromCache(token, routeInfo, viewKind, transitionPolicy)) return;
      if (shouldSkipRouteRender(config.keepAlive, viewKind === 'layout', this.currentMountState())) return;

      if (config.loadingTemplate) {
        this.placeView({
          token,
          payload: getTemplate(config.loadingTemplate),
          routeInfo,
          viewKind,
          transitionPolicy,
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
          transitionPolicy,
        });
        return;
      }

      this.placeView({
        token,
        payload: payload as Node | string,
        routeInfo,
        viewKind,
        transitionPolicy,
      });
    } catch (error) {
      if (this.renderSignal.aborted || !this.isTokenCurrent(token)) return;
      this.showRenderError(token, error, routeInfo, transitionPolicy);
      throw error;
    }
  }

  // --- Public: route lifecycle ---

  onTransitionIn(): void {
    if (this.lastMountStrategy !== 'stage' || !this.activeHandle) return;
    this.activeHandle.mountOutlet.commitStage(this.activeHandle.viewRoot);
    this.lastMountStrategy = 'replace';
  }

  onLeft(): void {
    this.renderSignal.cancel();
    this.cancelStagedMount();

    const config = this.config;
    const detached = unmountRoute(this.activeHandle, config.keepAlive);
    this.activeHandle = null;

    if (config.keepAlive && detached) {
      this.viewCache.put(this.lastCacheKey ?? this.config.path, detached);
    } else {
      this.childOutlet = null;
    }
  }

  onReenter(route: RouteInfo): void {
    if (!this.config.keepAlive) return;

    const cached = this.viewCache.extract(this.cacheKey(route));
    if (!cached) return;

    this.reattachFromCache(
      this.getLifecycleToken(),
      cached,
      undefined,
      viewKindOf(this.config),
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
    transitionPolicy?: TransitionPolicy,
  ): boolean {
    if (!this.config.keepAlive) return false;

    const cached = this.viewCache.extract(this.cacheKey(routeInfo));
    if (!cached) return false;

    this.reattachFromCache(token, cached, routeInfo, viewKind, transitionPolicy);
    return true;
  }

  private cacheKey(source?: ViewCacheKeySource): string {
    return viewCacheKey(source, this.config.path);
  }

  private rememberCacheKey(source?: ViewCacheKeySource): void {
    if (source === undefined) return;
    this.lastCacheKey = this.cacheKey(source);
  }

  // --- Private: outlet mount ---

  private currentMountState(): ViewMountState {
    return {
      activeHandle: this.activeHandle,
      childOutlet: this.childOutlet,
      detachedRoot: null,
    };
  }

  private buildMountContext(
    routeInfo?: MatchedRouteInfo,
    transitionPolicy?: TransitionPolicy,
    pattern?: string,
  ): ViewMountContext {
    return {
      pattern: routeInfo?.pattern ?? pattern,
      rootOutlet: this.outlets.resolveRootOutlet(),
      parentOutlet: this.outlets.parentOutlet(routeInfo),
      signal: this.renderSignal.signal,
      transitionPolicy,
    };
  }

  private reattachFromCache(
    token: number,
    root: ViewRoot,
    routeInfo?: MatchedRouteInfo,
    viewKind: RouteViewKind = viewKindOf(this.config),
    transitionPolicy?: TransitionPolicy,
    pattern?: string,
  ): void {
    this.placeView({
      token,
      payload: root,
      routeInfo,
      viewKind,
      transitionPolicy,
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
      this.buildMountContext(input.routeInfo, input.transitionPolicy, input.pattern),
      input.payload,
      previous,
    );

    this.lastMountStrategy = result.appliedStrategy ?? 'replace';
    this.applyMountResult(result, input.viewKind);
    this.rememberCacheKey(input.routeInfo);
  }

  private applyMountResult(result: ViewMountState, viewKind: RouteViewKind): void {
    this.activeHandle = result.activeHandle;
    this.childOutlet = result.childOutlet;

    if (viewKind === 'layout' && !result.childOutlet) {
      console.warn(
        `AuraRoute layout "${this.config.layout}" (path: ${this.config.path}) has no <aura-outlet>`,
      );
    }
  }

  private cancelStagedMount(): void {
    if (this.lastMountStrategy !== 'stage' || !this.activeHandle) return;
    this.activeHandle.mountOutlet.cancelStage();
    this.lastMountStrategy = 'replace';
  }

  // --- Private: content resolution ---

  private async resolvePayload(
    viewKind: RouteViewKind,
    routeInfo?: MatchedRouteInfo,
  ): Promise<Node | string | null> {
    const config = this.config;

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
    transitionPolicy?: TransitionPolicy,
  ): void {
    const config = this.config;

    if (config.errorTemplate) {
      try {
        this.placeView({
          token,
          payload: getTemplate(config.errorTemplate),
          routeInfo,
          viewKind: 'content',
          transitionPolicy,
        });
        return;
      } catch (templateError) {
        console.warn(`Failed to render errorTemplate for route "${config.path}":`, templateError);
      }
    }

    this.showFallbackError(token, error);
  }

  private showFallbackError(token: number, error: unknown): void {
    console.error(`Error rendering AuraRoute (path: ${this.config.path}):`, error);
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

function viewKindOf(config: RouteViewConfig): RouteViewKind {
  return config.layout ? 'layout' : 'content';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
