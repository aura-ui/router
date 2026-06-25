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
  mergeMountSnapshot,
  mountRoute,
  reattachRoute,
  rollbackStagedMount,
  toViewMountState,
  unmountOnLeave,
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

/** Bumped by {@link AuraRoute} on render/leave to invalidate in-flight async work. */
type LifecycleToken = number;

type MountOperation = () => ViewMountState | null;

/**
 * View state and render orchestration for {@link AuraRoute}.
 * Outlet policy lives in {@link outlet-adapter}; stage lifecycle calls {@link AuraOutlet} directly.
 * Content loading is injected via {@link RouteContentPort}.
 */
export class AuraRouteViewController {
  private readonly route: AuraRouteInterface;
  private readonly contentPort: RouteContentPort;
  private readonly renderSignal = new RouteRenderSignal();
  private readonly viewCache: RouteViewCachePort;
  private readonly getAppOutlet: () => AuraOutlet;
  private readonly getMountOutlet: (routeInfo: MatchedRouteInfo) => AuraOutlet | null;
  private readonly getLifecycleToken: () => LifecycleToken;

  private mount: RouteMountSnapshot = { ...EMPTY_ROUTE_MOUNT };
  /** Cache key from the last {@link render}; used by {@link onLeft} when stashing keep-alive DOM. */
  private lastCacheKey: string | null = null;

  constructor(
    route: AuraRouteInterface,
    contentPort: RouteContentPort,
    viewCache: RouteViewCachePort,
    getAppOutlet: () => AuraOutlet,
    getMountOutlet: (routeInfo: MatchedRouteInfo) => AuraOutlet | null,
    getLifecycleToken: () => LifecycleToken = () => 0,
  ) {
    this.route = route;
    this.contentPort = contentPort;
    this.viewCache = viewCache;
    this.getAppOutlet = getAppOutlet;
    this.getMountOutlet = getMountOutlet;
    this.getLifecycleToken = getLifecycleToken;
  }

  // --- Public accessors ---

  /** Nested `<aura-outlet>` from the active layout mount, if any. */
  get nestedOutlet(): AuraOutlet | null {
    return this.mount.nestedOutlet;
  }

  /** Combined parent + local abort signal for the current render pass. */
  get signal(): AbortSignal {
    return this.renderSignal.signal;
  }

  // --- Public API (route lifecycle order) ---

  /** Eagerly loads route content when `preload` is enabled on the element. */
  async preload(): Promise<void> {
    await this.contentPort.preload?.(this.renderSignal.signal);
  }

  /**
   * Resolves and mounts route content (or restores a keep-alive view).
   * Rethrows after mounting {@link AuraRouteInterface#errorTemplate} on failure.
   */
  async render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    const { parentSignal } = options ?? {};
    const lifecycleToken = this.getLifecycleToken();

    try {
      this.renderSignal.begin(parentSignal);
      this.lastCacheKey = viewCacheKey(routeInfo, this.route.path);

      if (this.tryRestoreFromCache(lifecycleToken, routeInfo)) return;
      if (this.shouldSkipKeepAliveRender()) return;

      await this.renderWithoutCache(lifecycleToken, routeInfo);
    } catch (error) {
      if (this.isRenderStale(lifecycleToken)) return;
      this.mountRenderError(lifecycleToken, error, routeInfo);
      throw error;
    }
  }

  /**
   * Promotes a staged incoming view to the active root.
   * No-op unless the last mount used outlet `stage`.
   */
  commitStagedView(): void {
    this.mount = commitStagedMount(this.mount);
  }

  /** Detaches or destroys the active view; stashes DOM when `keepAlive` is set. */
  onLeft(): void {
    this.renderSignal.cancel();

    const { keepAlive } = this.route;
    const { snapshot, detachedRoot } = unmountOnLeave(this.mount, keepAlive);
    this.mount = finalizeLeaveMount(snapshot, keepAlive, detachedRoot);

    if (keepAlive && detachedRoot) {
      this.viewCache.put(this.lastCacheKey ?? this.route.path, detachedRoot);
    }
  }

  /** Aborts the in-flight render signal only. */
  cancel(): void {
    this.renderSignal.cancel();
  }

  /** Rolls back a staged mount and aborts the in-flight render. */
  cancelPendingRender(): void {
    this.mount = rollbackStagedMount(this.mount);
    this.renderSignal.cancel();
  }

  // --- Private: guards ---

  /** Whether this render pass was aborted or superseded by a newer lifecycle. */
  private isRenderStale(lifecycleToken: LifecycleToken): boolean {
    return this.renderSignal.aborted || this.getLifecycleToken() !== lifecycleToken;
  }

  // --- Private: render orchestration ---

  /** Reattaches a stashed view; returns whether cache restore handled the render. */
  private tryRestoreFromCache(lifecycleToken: LifecycleToken, routeInfo: MatchedRouteInfo): boolean {
    if (!this.route.keepAlive) return false;

    const cachedRoot = this.viewCache.extract(viewCacheKey(routeInfo, this.route.path));
    if (!cachedRoot) return false;

    this.reattachCachedView(lifecycleToken, cachedRoot, routeInfo);
    return true;
  }

  /** Skips reload when keep-alive is on and the current mount is still valid. */
  private shouldSkipKeepAliveRender(): boolean {
    const viewKind = resolveViewKind(this.route);
    return this.route.keepAlive
      && hasActiveMount(toViewMountState(this.mount), viewKind === 'layout');
  }

  /** Shows loading template, resolves content, and mounts the result. */
  private async renderWithoutCache(lifecycleToken: LifecycleToken, routeInfo: MatchedRouteInfo): Promise<void> {
    const { loadingTemplate } = this.route;

    // TODO: body className and loading event
    if (loadingTemplate) {
      this.mountView(lifecycleToken, getTemplate(loadingTemplate), routeInfo);
    }

    const viewContent = await this.resolveViewContent(routeInfo);
    if (this.isRenderStale(lifecycleToken)) return;

    if (viewContent == null) {
      if (resolveViewKind(this.route) === 'content') {
        this.mountView(lifecycleToken, EMPTY_CONTENT_HTML, routeInfo);
      }
      return;
    }

    this.mountView(lifecycleToken, viewContent, routeInfo);
  }

  /** Layout template, content-loader result, or optional content cache entry. */
  private async resolveViewContent(routeInfo: MatchedRouteInfo): Promise<Node | string | null> {
    if (resolveViewKind(this.route) === 'layout') {
      return getTemplate(this.route.layout!);
    }

    const cached = this.contentPort.readCache?.(routeInfo);
    if (cached) return cached;

    const viewContent = await this.contentPort.resolve(routeInfo, this.renderSignal.signal);
    if (viewContent) {
      this.contentPort.writeCache?.(routeInfo, viewContent);
    }

    return viewContent;
  }

  /** Mounts the error template (or fallback HTML) after a render failure. */
  private mountRenderError(
    lifecycleToken: LifecycleToken,
    error: unknown,
    routeInfo: MatchedRouteInfo,
  ): void {
    this.runMount(
      lifecycleToken,
      () => mountRoute(
        this.buildMountContext(routeInfo),
        resolveErrorViewPayload(this.route, error),
        toViewMountState(this.mount),
      ),
      'content',
    );
  }

  // --- Private: outlet mount ---

  /** Mounts resolved HTML/DOM into the target outlet when the lifecycle is still current. */
  private mountView(
    lifecycleToken: LifecycleToken,
    viewContent: Node | string,
    routeInfo: MatchedRouteInfo,
  ): void {
    this.runMount(lifecycleToken, () =>
      mountRoute(this.buildMountContext(routeInfo), viewContent, toViewMountState(this.mount)),
    );
  }

  /** Re-inserts a detached keep-alive root from the view cache. */
  private reattachCachedView(
    lifecycleToken: LifecycleToken,
    cachedRoot: ViewRoot,
    routeInfo: MatchedRouteInfo,
  ): void {
    this.runMount(lifecycleToken, () =>
      reattachRoute(this.buildMountContext(routeInfo), cachedRoot),
    );
  }

  /** Runs an outlet mount and merges the result into {@link mount}. */
  private runMount(
    lifecycleToken: LifecycleToken,
    operation: MountOperation,
    viewKind: RouteViewKind = resolveViewKind(this.route),
  ): void {
    if (this.getLifecycleToken() !== lifecycleToken) return;

    const mountResult = operation();
    if (!mountResult) return;

    this.mount = mergeMountSnapshot(this.mount, mountResult);
    warnMissingLayoutOutlet(this.route, viewKind, mountResult);
  }

  /** Outlet targets, pattern key, abort signal, and stage/replace flag for one mount. */
  private buildMountContext(routeInfo: MatchedRouteInfo): ViewMountContext {
    return {
      pattern: routeInfo.pattern,
      appOutlet: this.getAppOutlet(),
      mountOutlet: this.getMountOutlet(routeInfo),
      signal: this.renderSignal.signal,
      useStagedMount: this.useStagedMount,
    };
  }

  /** `true` when the route inherits a non-empty `data-transition`. */
  private get useStagedMount(): boolean {
    return !!this.route.transition?.trim();
  }
}

/** `layout` when the route declares a layout template; otherwise `content`. */
function resolveViewKind(route: AuraRouteInterface): RouteViewKind {
  return route.layout?.trim() ? 'layout' : 'content'; //todo move trim to parser
}
