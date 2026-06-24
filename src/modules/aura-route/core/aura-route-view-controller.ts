import { getTemplate } from '../../aura-utils/misc';
import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { TransitionPolicy } from '../../aura-routing-engine/core/transition/policy';
import type { AuraOutlet, OutletStrategy, ViewHandle, ViewRoot } from '../../aura-outlet/core/aura-outlet';
import { RouteRenderSignal } from './render-signal';
import { RouteContentLoader, resolveRouteContentLoaderService } from './route-content-loader';
import {
  commitStagedMount,
  mountRoute,
  shouldSkipRouteRender,
  unmountRoute,
  type RouteMountContext,
  type RouteMountResult,
  type RouteMountType,
} from './route-mount';

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
  resolveAppOutlet: () => AuraOutlet;
  parentResolvedOutlet(routeInfo?: MatchedRouteInfo): AuraOutlet | null;
}

/**
 * View state and render orchestration for {@link AURARoute}.
 * Mount primitives stay in {@link route-mount}; content loading is injected via {@link RouteContentPort}.
 */
export class AuraRouteViewController {
  private isActive = false;
  private readonly renderSignal = new RouteRenderSignal();

  private activeHandle: ViewHandle | null = null;
  private detachedRoot: ViewRoot | null = null;
  private lastMountStrategy: Extract<OutletStrategy, 'replace' | 'stage'> = 'replace';

  /** Nested `<aura-outlet>` inside mounted layout; children render here. */
  resolvedOutlet: AuraOutlet | null = null;

  private readonly getConfig: () => RouteViewConfig;
  private readonly outlets: RouteOutletPort;
  private readonly content: RouteContentPort;

  constructor(
    getConfig: () => RouteViewConfig,
    outlets: RouteOutletPort,
    content: RouteContentPort,
  ) {
    this.getConfig = getConfig;
    this.outlets = outlets;
    this.content = content;
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

  private get mountType(): RouteMountType {
    return this.config.layout ? 'layout' : 'content';
  }

  private get requiresChildOutlet(): boolean {
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

      if (this.config.keepAlive && this.detachedRoot) {
        this.reattach(routeInfo, transitionPolicy);
        return;
      }

      if (shouldSkipRouteRender(this.config.keepAlive, this.requiresChildOutlet, this.snapshot())) {
        return;
      }

      if (this.config.loadingTemplate) {
        this.show(getTemplate(this.config.loadingTemplate), routeInfo, this.mountType, transitionPolicy);
      }

      const payload = await this.resolvePayload(routeInfo);
      if (this.renderSignal.aborted) return;

      if (this.mountType === 'content' && !payload) {
        this.show('<div>No content to display</div>', routeInfo, 'content', transitionPolicy);
        return;
      }

      this.show(payload!, routeInfo, this.mountType, transitionPolicy);
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

    this.detachedRoot = unmountRoute({ handle: this.activeHandle, keepAlive: this.config.keepAlive });
    this.activeHandle = null;

    if (!this.config.keepAlive) {
      this.detachedRoot = null;
      this.resolvedOutlet = null;
    }
  }

  onReenter(routePath: string): void {
    if (!this.config.keepAlive || !this.detachedRoot) return;
    this.isActive = true;
    this.reattach(undefined, undefined, routePath);
  }

  private snapshot(): RouteMountResult {
    return {
      activeHandle: this.activeHandle,
      resolvedOutlet: this.resolvedOutlet,
      detachedRoot: this.detachedRoot,
    };
  }

  private mountContext(
    routeInfo?: MatchedRouteInfo,
    transitionPolicy?: TransitionPolicy,
    routePath?: string,
  ): RouteMountContext {
    return {
      routePath: routeInfo?.routePath ?? routePath,
      appOutlet: this.outlets.resolveAppOutlet(),
      parentResolvedOutlet: this.outlets.parentResolvedOutlet(routeInfo),
      signal: this.renderSignal.signal,
      transitionPolicy,
    };
  }

  private reattach(
    routeInfo?: MatchedRouteInfo,
    transitionPolicy?: TransitionPolicy,
    routePath?: string,
  ): void {
    if (!this.detachedRoot) return;
    this.show(this.detachedRoot, routeInfo, this.mountType, transitionPolicy, routePath);
  }

  private applyMountResult(result: RouteMountResult, mountType: RouteMountType = this.mountType): void {
    this.activeHandle = result.activeHandle;
    this.resolvedOutlet = result.resolvedOutlet;
    this.detachedRoot = result.detachedRoot;

    if (mountType === 'layout' && !result.resolvedOutlet) {
      console.warn(
        `AURARoute layout "${this.config.layout}" (path: ${this.config.path}) has no <aura-outlet>`,
      );
    }
  }

  private show(
    payload: Node | string,
    routeInfo?: MatchedRouteInfo,
    mountType: RouteMountType = this.mountType,
    transitionPolicy?: TransitionPolicy,
    routePath?: string,
  ): void {
    if (!this.isActive) return;

    const result = mountRoute({
      ctx: this.mountContext(routeInfo, transitionPolicy, routePath),
      content: payload,
      previous: this.snapshot(),
    });

    this.lastMountStrategy = result.appliedStrategy ?? 'replace';
    this.applyMountResult(result, mountType);
  }

  private async resolvePayload(routeInfo?: MatchedRouteInfo): Promise<Node | string | null> {
    if (this.mountType === 'layout') {
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
    console.error(`Error rendering AURARoute (path: ${this.config.path}):`, error);

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
      resolveAppOutlet: resolveRootOutlet,
      parentResolvedOutlet: (routeInfo) =>
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
