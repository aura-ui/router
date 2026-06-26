import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';
import type { AuraOutlet, ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import type { RouteRenderOptions } from '../types';
import type { ViewPayload, RouteViewConfig } from './ports';
import { createRenderPass, isStale, type RenderPass } from './render-pass';
import { RenderSignal } from './render-signal';
import {
  EMPTY_MOUNT,
  commitStaged,
  hasActiveMount,
  mergeMount,
  mountContent,
  reattachContent,
  rollbackStaged,
  toMountSlice,
  unmountOnLeave,
  finalizeLeave,
  type MountContext,
  type MountSnapshot,
} from './outlet';
import { emptyContent, resolveError, warnMissingLayoutOutlet } from './payloads';

type PluginHook = 'onPassStart' | 'onPassEnd' | 'onContentResolved' | 'onMounted' | 'onPassError';

/**
 * View state and render orchestration for {@link AuraRoute2}.
 * Outlet policy lives in {@link outlet}; content loading via {@link ContentResolverPort}.
 */
export class RouteViewController {
  private readonly config: RouteViewConfig;
  private readonly getPassId: () => number;
  private readonly renderSignal = new RenderSignal();
  private mount: MountSnapshot = { ...EMPTY_MOUNT };
  /** Cache key from the last {@link render}; used by {@link onLeft} for keep-alive DOM. */
  private lastCacheKey: string | null = null;

  constructor(config: RouteViewConfig, getPassId: () => number) {
    this.config = config;
    this.getPassId = getPassId;
  }

  get nestedOutlet(): AuraOutlet | null {
    return this.mount.nestedOutlet;
  }

  get signal(): AbortSignal {
    return this.renderSignal.signal;
  }

  async prefetchContent(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void> {
    await this.config.content.prefetchContent(routeInfo, signal);
  }

  /**
   * Resolves and mounts route content (or restores a keep-alive view).
   * Rethrows after mounting the error template on failure.
   */
  async render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<void> {
    const pass = this.beginPass(routeInfo, options?.parentSignal);
    this.lastCacheKey = pass.cacheKey;
    await this.renderPass(pass);
  }

  commitStagedView(): void {
    this.mount = commitStaged(this.mount);
  }

  /** Detaches or destroys the active view; caches DOM when `keepAlive` is set. */
  onLeft(): void {
    this.renderSignal.cancel();

    const { keepAlive } = this.config.route;
    const { snapshot, detachedRoot } = unmountOnLeave(this.mount, keepAlive);
    this.mount = finalizeLeave(snapshot, keepAlive, detachedRoot);

    if (keepAlive && detachedRoot) {
      this.config.cache.put(this.lastCacheKey ?? this.config.route.path, detachedRoot);
    }
  }

  cancel(): void {
    this.renderSignal.cancel();
  }

  cancelPendingRender(): void {
    this.mount = rollbackStaged(this.mount);
    this.renderSignal.cancel();
  }

  private beginPass(routeInfo: MatchedRouteInfo, parentSignal?: AbortSignal): RenderPass {
    const signal = this.renderSignal.begin(parentSignal);
    return createRenderPass(this.getPassId(), this.config.route, routeInfo, signal);
  }

  private async renderPass(pass: RenderPass): Promise<void> {
    let loadingHooks = false;

    try {
      if (this.tryCacheRestore(pass)) return;
      if (this.shouldSkipKeepAlive(pass)) return;

      this.emit('onPassStart', pass);
      loadingHooks = true;
      await this.resolveAndMount(pass);
    } catch (error) {
      if (this.stale(pass)) return;
      this.emit('onPassError', pass, error);
      this.applyMount(pass, resolveError(this.config.route, error), 'content');
      throw error;
    } finally {
      if (loadingHooks) {
        this.emit('onPassEnd', pass);
      }
    }
  }

  private tryCacheRestore(pass: RenderPass): boolean {
    if (!this.config.route.keepAlive) return false;

    const cachedRoot = this.config.cache.extract(pass.cacheKey);
    if (!cachedRoot) return false;

    return this.applyMount(pass, cachedRoot, pass.viewKind, cachedRoot);
  }

  private shouldSkipKeepAlive(pass: RenderPass): boolean {
    return this.config.route.keepAlive
      && hasActiveMount(toMountSlice(this.mount), pass.viewKind === 'layout');
  }

  private async resolveAndMount(pass: RenderPass): Promise<void> {
    const payload = await this.config.content.resolve(pass.routeInfo, pass.signal);

    if (this.stale(pass)) return;

    if (payload == null) {
      if (pass.viewKind === 'content') {
        this.applyMount(pass, emptyContent(), 'content');
      }
      return;
    }

    this.emit('onContentResolved', pass, payload);
    this.applyMount(pass, payload, pass.viewKind);
  }

  private applyMount(
    pass: RenderPass,
    payload: ViewPayload | ViewRoot,
    viewKind: RenderPass['viewKind'],
    cachedRoot?: ViewRoot,
  ): boolean {
    if (this.stale(pass)) return false;

    const ctx = this.mountContext(pass);
    const slice = cachedRoot
      ? reattachContent(ctx, cachedRoot)
      : mountContent(ctx, payload as ViewPayload);

    if (!slice?.activeHandle) return false;

    this.mount = mergeMount(this.mount, slice);
    warnMissingLayoutOutlet(this.config.route, viewKind, slice.nestedOutlet);
    this.emit('onMounted', pass);
    return true;
  }

  private mountContext(pass: RenderPass): MountContext {
    const { mountTarget } = this.config;
    return {
      pattern: pass.routeInfo.pattern,
      appOutlet: mountTarget.appOutlet(),
      mountOutlet: mountTarget.nestedOutlet(pass.routeInfo),
      signal: pass.signal,
      useStagedMount: pass.useStagedMount,
    };
  }

  private stale(pass: RenderPass): boolean {
    return isStale(pass, this.getPassId, () => this.renderSignal.aborted);
  }

  private emit(hook: PluginHook, pass: RenderPass, arg?: unknown): void {
    for (const plugin of this.config.plugins ?? []) {
      const fn = plugin[hook];
      if (!fn) continue;
      if (hook === 'onContentResolved') {
        (fn as (p: RenderPass, v: ViewPayload) => void)(pass, arg as ViewPayload);
      } else if (hook === 'onPassError') {
        (fn as (p: RenderPass, e: unknown) => void)(pass, arg);
      } else {
        (fn as (p: RenderPass) => void)(pass);
      }
    }
  }
}
