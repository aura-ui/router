import type { MatchedRouteInfo } from '../../../aura-routing-engine/core';
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
import type { ViewRenderResult } from '../../../aura-routing-engine/core';

type PluginHook = 'onPassStart' | 'onPassEnd' | 'onContentResolved' | 'onMounted' | 'onPassError';

/** Clears transition inline styles and cancels element animations. */
export function resetViewRootPresentation(root: HTMLElement): void {
  root.style.removeProperty('opacity');
  root.style.removeProperty('transform');
  root.getAnimations?.().forEach((animation) => animation.cancel());
}

/**
 * View state and render orchestration for {@link AuraRoute}.
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

  /**
   * Resolves and mounts route content (or restores a keep-alive view).
   * Returns `{ status: 'error' }` after mounting recovery UI — does not rethrow.
   */
  async render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<ViewRenderResult> {
    const pass = this.beginPass(routeInfo, options?.parentSignal);
    this.lastCacheKey = pass.cacheKey;
    return this.renderPass(pass);
  }

  commitStagedView(): void {
    this.mount = commitStaged(this.mount);
  }

  /** Detaches or destroys the active view; caches DOM when view preservation is on. */
  onLeft(): void {
    this.renderSignal.cancel();

    const preserveView = this.config.route.preserve.view;
    const { snapshot, detachedRoot } = unmountOnLeave(this.mount, preserveView);
    this.mount = finalizeLeave(snapshot, preserveView, detachedRoot);

    if (preserveView && detachedRoot) {
      this.config.cache.put(this.lastCacheKey ?? this.config.route.path, detachedRoot);
    }
  }

  cancel(): void {
    this.renderSignal.cancel();
  }

  /**
   * Roll back staged mount and transition presentation without post-commit teardown.
   *
   * @see rollbackStaged — TODO(revert-in-flight-view) for replace vs stage semantics.
   */
  revertInFlightView(): void {
    this.mount = rollbackStaged(this.mount);
    this.renderSignal.cancel();
    this.clearViewPresentation();
  }

  private clearViewPresentation(): void {
    const roots = [
      this.mount.activeHandle?.viewRoot,
      this.mount.stageOutgoingHandle?.viewRoot,
    ];

    for (const root of roots) {
      if (root) resetViewRootPresentation(root);
    }
  }

  private beginPass(routeInfo: MatchedRouteInfo, parentSignal?: AbortSignal): RenderPass {
    const signal = this.renderSignal.begin(parentSignal);
    return createRenderPass(this.getPassId(), this.config.route, routeInfo, signal);
  }

  private async renderPass(pass: RenderPass): Promise<ViewRenderResult> {
    let loadingHooks = false;

    try {
      if (this.tryCacheRestore(pass)) return { status: 'ok' };
      if (this.shouldSkipKeepAlive(pass)) return { status: 'ok' };

      this.emit('onPassStart', pass);
      loadingHooks = true;
      await this.resolveAndMount(pass);
      return { status: 'ok' };
    } catch (error) {
      if (this.stale(pass)) return { status: 'ok' };
      this.emit('onPassError', pass, error);
      this.applyMount(pass, resolveError(this.config.route, error), 'content');
      return { status: 'error', error };
    } finally {
      if (loadingHooks) {
        this.emit('onPassEnd', pass);
      }
    }
  }

  private tryCacheRestore(pass: RenderPass): boolean {
    if (!this.config.route.preserve.view) return false;

    const cachedRoot = this.config.cache.extract(pass.cacheKey);
    if (!cachedRoot) return false;

    return this.applyMount(pass, cachedRoot, pass.viewKind, cachedRoot);
  }

  private shouldSkipKeepAlive(pass: RenderPass): boolean {
    return this.config.route.preserve.view
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
