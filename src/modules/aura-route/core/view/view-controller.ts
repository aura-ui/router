import { getTemplate } from '../../../aura-utils/misc';
import type { MatchedRouteInfo, RouteInfo } from '../../../aura-route-hooks/core';
import type { TransitionPolicy } from '../../../aura-routing-engine/core/transition/policy';
import type { AuraOutlet, OutletStrategy, ViewHandle, ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import { RouteRenderSignal } from '../render-signal';
import { RouteContentLoader, resolveRouteContentLoaderService } from '../route-content-loader';
import {
  defaultRouteViewCache,
  type RouteViewCachePort,
} from './view-cache';
import { viewCacheKey, type ViewCacheKeySource } from './view-cache-key';
import {
  commitStagedMount,
  mountRoute,
  shouldSkipRouteRender,
  unmountRoute,
  type RouteMountContext,
  type RouteMountResult,
} from '../route-mount';

type RouteViewKind = 'layout' | 'content';

export type RouteRenderOptions = {
  signal?: AbortSignal;
  transitionPolicy?: TransitionPolicy;
};

/** Static route view configuration (attrs), without HTMLElement coupling. */
export type RouteViewConfig = {
  path: string;
  layout?: string;
  keepAlive: boolean;
  loadingTemplate?: string;
  errorTemplate?: string;
};

/** Resolves route payload: layout template, loader, cache, preload. */
export interface RouteContentPort {
  resolve(routeInfo: MatchedRouteInfo | undefined, signal: AbortSignal): Promise<Node | string | null>;
  preload?(signal: AbortSignal): Promise<void>;
  readCache?(routeInfo: MatchedRouteInfo | undefined): Node | string | null;
  writeCache?(routeInfo: MatchedRouteInfo, payload: Node | string): void;
}

/** Outlet access for nested route trees. */
export interface RouteOutletPort {
  resolveRootOutlet: () => AuraOutlet;
  parentOutlet(routeInfo?: MatchedRouteInfo): AuraOutlet | null;
}

/**
 * View state and render orchestration for {@link AuraRoute}.
 * Mount primitives stay in {@link route-mount}; content loading is injected via {@link RouteContentPort}.
 */
export class AuraRouteViewController {
  private readonly renderSignal = new RouteRenderSignal();

  private activeHandle: ViewHandle | null = null;
  private lastMountStrategy: Extract<OutletStrategy, 'replace' | 'stage'> = 'replace';
  private lastStashKey: string | null = null;

  /** Nested `<aura-outlet>` inside mounted layout; children render here. */
  resolvedOutlet: AuraOutlet | null = null;

  private readonly getConfig: () => RouteViewConfig;
  private readonly outlets: RouteOutletPort;
  private readonly content: RouteContentPort;
  private readonly viewCache: RouteViewCachePort;
  private readonly getLifecycleToken: () => number;

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

  async preload(): Promise<void> {
    await this.content.preload?.(this.renderSignal.signal);
  }

  private cancelStagedMountIfAny(): void {
    if (this.lastMountStrategy !== 'stage' || !this.activeHandle) return;
    this.activeHandle.mountOutlet.cancelStage();
    this.lastMountStrategy = 'replace';
  }

  cancelPendingRender(): void {
    this.cancelStagedMountIfAny();
    this.renderSignal.cancel();
  }

  private isTokenCurrent(token: number): boolean {
    return this.getLifecycleToken() === token;
  }

  async render(routeInfo?: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    const { signal, transitionPolicy } = options ?? {};
    const token = this.getLifecycleToken();
    const config = this.config;
    const viewKind: RouteViewKind = config.layout ? 'layout' : 'content';
    const isLayout = viewKind === 'layout';

    try {
      this.renderSignal.begin(signal);
      this.syncStashKey(routeInfo);

      if (!this.isTokenCurrent(token)) return;

      if (config.keepAlive) {
        const cached = this.viewCache.extract(this.cacheKey(routeInfo));
        if (cached) {
          this.reattach(token, routeInfo, viewKind, transitionPolicy, undefined, cached);
          return;
        }
      }

      if (shouldSkipRouteRender(config.keepAlive, isLayout, this.snapshot())) {
        return;
      }

      if (config.loadingTemplate) {
        this.show(token, getTemplate(config.loadingTemplate), routeInfo, viewKind, transitionPolicy);
      }

      const payload = await this.resolvePayload(viewKind, routeInfo);
      if (this.renderSignal.aborted || !this.isTokenCurrent(token)) return;

      if (viewKind === 'content' && !payload) {
        this.show(token, '<div>No content to display</div>', routeInfo, 'content', transitionPolicy);
        return;
      }

      this.show(token, payload as Node | string, routeInfo, viewKind, transitionPolicy);
    } catch (error) {
      if (this.renderSignal.aborted || !this.isTokenCurrent(token)) return;

      if (config.errorTemplate) {
        try {
          this.show(token, getTemplate(config.errorTemplate), routeInfo, 'content', transitionPolicy);
        } catch (templateError) {
          console.warn(`Failed to render errorTemplate for route "${config.path}":`, templateError);
          this.handleRenderError(token, error);
        }
      } else {
        this.handleRenderError(token, error);
      }

      throw error;
    }
  }

  onTransitionIn(): void {
    if (this.lastMountStrategy !== 'stage') return;
    commitStagedMount(this.snapshot());
    this.lastMountStrategy = 'replace';
  }

  onLeft(): void {
    this.renderSignal.cancel();

    this.cancelStagedMountIfAny();

    const config = this.config;
    const detached = unmountRoute(this.activeHandle, config.keepAlive);
    this.activeHandle = null;

    if (config.keepAlive && detached) {
      this.viewCache.put(this.stashKey(), detached);
    } else {
      this.resolvedOutlet = null;
    }
  }

  onReenter(route: RouteInfo): void {
    if (!this.config.keepAlive) return;

    const cached = this.viewCache.extract(this.cacheKey(route));
    if (!cached) return;

    const token = this.getLifecycleToken();
    const config = this.config;
    const viewKind: RouteViewKind = config.layout ? 'layout' : 'content';
    this.reattach(token, undefined, viewKind, undefined, route.pathname, cached, route);
  }

  private snapshot(): RouteMountResult {
    return {
      activeHandle: this.activeHandle,
      resolvedOutlet: this.resolvedOutlet,
      detachedRoot: null,
    };
  }

  private cacheKey(source?: ViewCacheKeySource): string {
    return viewCacheKey(source, this.config.path);
  }

  private syncStashKey(source?: ViewCacheKeySource): void {
    if (source === undefined) return;
    this.lastStashKey = this.cacheKey(source);
  }

  private stashKey(): string {
    return this.lastStashKey ?? this.config.path;
  }

  private mountContext(
    routeInfo?: MatchedRouteInfo,
    transitionPolicy?: TransitionPolicy,
    pattern?: string,
  ): RouteMountContext {
    return {
      pattern: routeInfo?.pattern ?? pattern,
      rootOutlet: this.outlets.resolveRootOutlet(),
      parentOutlet: this.outlets.parentOutlet(routeInfo),
      signal: this.renderSignal.signal,
      transitionPolicy,
    };
  }

  private reattach(
    token: number,
    routeInfo?: MatchedRouteInfo,
    viewKind: RouteViewKind = this.config.layout ? 'layout' : 'content',
    transitionPolicy?: TransitionPolicy,
    pattern?: string,
    extractedRoot?: ViewRoot,
    cacheRoute?: ViewCacheKeySource,
  ): void {
    if (!extractedRoot) return;
    this.show(token, extractedRoot, routeInfo, viewKind, transitionPolicy, pattern, extractedRoot, cacheRoute);
  }

  private applyMountResult(result: RouteMountResult, viewKind: RouteViewKind): void {
    this.activeHandle = result.activeHandle;
    this.resolvedOutlet = result.resolvedOutlet;

    if (viewKind === 'layout' && !result.resolvedOutlet) {
      console.warn(
        `AuraRoute layout "${this.config.layout}" (path: ${this.config.path}) has no <aura-outlet>`,
      );
    }
  }

  private show(
    token: number,
    payload: Node | string,
    routeInfo?: MatchedRouteInfo,
    viewKind: RouteViewKind,
    transitionPolicy?: TransitionPolicy,
    pattern?: string,
    extractedRoot?: ViewRoot,
    _cacheRoute?: ViewCacheKeySource,
  ): void {
    if (!this.isTokenCurrent(token)) return;

    const previous: RouteMountResult = extractedRoot
      ? { activeHandle: null, resolvedOutlet: null, detachedRoot: extractedRoot }
      : this.snapshot();

    const result = mountRoute(this.mountContext(routeInfo, transitionPolicy, pattern), payload, previous);

    this.lastMountStrategy = result.appliedStrategy ?? 'replace';
    this.applyMountResult(result, viewKind);
    this.syncStashKey(routeInfo);
  }

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

  private handleRenderError(token: number, error: unknown): void {
    console.error(`Error rendering AuraRoute (path: ${this.config.path}):`, error);

    if (!this.isTokenCurrent(token)) return;

    const message = escapeHtml(error instanceof Error ? error.message : 'Error loading content');
    const stackTrace = escapeHtml(error instanceof Error ? error.stack ?? '' : '');

    this.show(
      token,
      `<div class="aura-route-error">
      <h2>Content Loading Error</h2>
      <p>${message}</p>
      ${stackTrace ? `<pre class="error-stack">${stackTrace}</pre>` : ''}
    </div>`,
      undefined,
      'content',
    );
  }
}

function escapeHtml(value: string): string {
  // Minimal escaping for rendering errors into HTML templates.
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export type AuraRouteViewHost = {
  readonly path: string;
  readonly layout: string;
  readonly source: string;
  readonly content: string;
  readonly cache: boolean;
  readonly keepAlive: boolean;
  readonly loadingTemplate: string;
  readonly errorTemplate: string;
};

export function createAuraRouteViewController(
  host: AuraRouteViewHost,
  resolveRootOutlet: () => AuraOutlet,
  getLifecycleToken: () => number = () => 0,
): AuraRouteViewController {
  return new AuraRouteViewController(
    () => ({
      path: host.path,
      layout: host.layout || undefined,
      keepAlive: host.keepAlive,
      loadingTemplate: host.loadingTemplate || undefined,
      errorTemplate: host.errorTemplate || undefined,
    }),
    {
      resolveRootOutlet: resolveRootOutlet,
      parentOutlet: (routeInfo) =>
        routeInfo?.node?.parent?.route.resolvedOutlet ?? null,
    },
    new RouteContentLoader(
      () => ({
        path: host.path,
        source: host.source,
        content: host.content,
        cache: host.cache,
      }),
      resolveRouteContentLoaderService(),
    ),
    undefined,
    getLifecycleToken,
  );
}
