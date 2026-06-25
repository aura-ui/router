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
  private isActive = false;
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

  constructor(
    getConfig: () => RouteViewConfig,
    outlets: RouteOutletPort,
    content: RouteContentPort,
    viewCache: RouteViewCachePort = defaultRouteViewCache,
  ) {
    this.getConfig = getConfig;
    this.outlets = outlets;
    this.content = content;
    this.viewCache = viewCache;
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

  private get viewKind(): RouteViewKind {
    return this.config.layout ? 'layout' : 'content';
  }

  private get isLayout(): boolean {
    return !!this.config.layout;
  }

  cancel(): void {
    this.renderSignal.cancel();
  }

  async preload(): Promise<void> {
    await this.content.preload?.(this.renderSignal.signal);
  }

  cancelPendingRender(): void {
    if (this.lastMountStrategy === 'stage' && this.activeHandle) {
      this.activeHandle.mountOutlet.cancelStage();
      this.lastMountStrategy = 'replace';
    }
    this.renderSignal.cancel();
  }

  async render(routeInfo?: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    const { signal, transitionPolicy } = options ?? {};

    try {
      this.isActive = true;
      this.renderSignal.begin(signal);
      this.syncStashKey(routeInfo);

      if (this.config.keepAlive) {
        const cached = this.viewCache.extract(this.cacheKey(routeInfo));
        if (cached) {
          this.reattach(routeInfo, transitionPolicy, undefined, cached);
          return;
        }
      }

      if (shouldSkipRouteRender(this.config.keepAlive, this.isLayout, this.snapshot())) {
        return;
      }

      if (this.config.loadingTemplate) {
        this.show(getTemplate(this.config.loadingTemplate), routeInfo, this.viewKind, transitionPolicy);
      }

      const payload = await this.resolvePayload(routeInfo);
      if (this.renderSignal.aborted) return;

      if (this.viewKind === 'content' && !payload) {
        this.show('<div>No content to display</div>', routeInfo, 'content', transitionPolicy);
        return;
      }

      this.show(payload!, routeInfo, this.viewKind, transitionPolicy);
    } catch (error) {
      if (this.renderSignal.aborted) return;

      if (this.config.errorTemplate) {
        try {
          this.show(getTemplate(this.config.errorTemplate), routeInfo, 'content', transitionPolicy);
        } catch (templateError) {
          console.warn(`Failed to render errorTemplate for route "${this.config.path}":`, templateError);
          this.handleRenderError(error);
        }
      } else {
        this.handleRenderError(error);
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
    this.isActive = false;
    this.renderSignal.cancel();

    if (this.lastMountStrategy === 'stage' && this.activeHandle) {
      this.activeHandle.mountOutlet.cancelStage();
      this.lastMountStrategy = 'replace';
    }

    const detached = unmountRoute(this.activeHandle, this.config.keepAlive);
    this.activeHandle = null;

    if (this.config.keepAlive && detached) {
      this.viewCache.put(this.stashKey(), detached);
    } else {
      this.resolvedOutlet = null;
    }
  }

  onReenter(route: RouteInfo): void {
    if (!this.config.keepAlive) return;

    const cached = this.viewCache.extract(this.cacheKey(route));
    if (!cached) return;

    this.isActive = true;
    this.reattach(undefined, undefined, route.pathname, cached, route);
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
    routeInfo?: MatchedRouteInfo,
    transitionPolicy?: TransitionPolicy,
    pattern?: string,
    extractedRoot?: ViewRoot,
    cacheRoute?: ViewCacheKeySource,
  ): void {
    if (!extractedRoot) return;
    this.show(extractedRoot, routeInfo, this.viewKind, transitionPolicy, pattern, extractedRoot, cacheRoute);
  }

  private applyMountResult(result: RouteMountResult, viewKind: RouteViewKind = this.viewKind): void {
    this.activeHandle = result.activeHandle;
    this.resolvedOutlet = result.resolvedOutlet;

    if (viewKind === 'layout' && !result.resolvedOutlet) {
      console.warn(
        `AuraRoute layout "${this.config.layout}" (path: ${this.config.path}) has no <aura-outlet>`,
      );
    }
  }

  private show(
    payload: Node | string,
    routeInfo?: MatchedRouteInfo,
    viewKind: RouteViewKind = this.viewKind,
    transitionPolicy?: TransitionPolicy,
    pattern?: string,
    extractedRoot?: ViewRoot,
    _cacheRoute?: ViewCacheKeySource,
  ): void {
    if (!this.isActive) return;

    const previous: RouteMountResult = extractedRoot
      ? { activeHandle: null, resolvedOutlet: null, detachedRoot: extractedRoot }
      : this.snapshot();

    const result = mountRoute(this.mountContext(routeInfo, transitionPolicy, pattern), payload, previous);

    this.lastMountStrategy = result.appliedStrategy ?? 'replace';
    this.applyMountResult(result, viewKind);
    this.syncStashKey(routeInfo);
  }

  private async resolvePayload(routeInfo?: MatchedRouteInfo): Promise<Node | string | null> {
    if (this.viewKind === 'layout') {
      return getTemplate(this.config.layout!);
    }

    const cached = this.content.readCache?.(routeInfo);
    if (cached) return cached;

    const payload = await this.content.resolve(routeInfo, this.renderSignal.signal);
    if (payload && routeInfo) {
      this.content.writeCache?.(routeInfo, payload);
    }

    return payload;
  }

  private handleRenderError(error: unknown): void {
    console.error(`Error rendering AuraRoute (path: ${this.config.path}):`, error);

    if (!this.isActive) return;

    const message = error instanceof Error ? error.message : 'Error loading content';
    const stackTrace = error instanceof Error ? error.stack : '';

    this.show(
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
  );
}
