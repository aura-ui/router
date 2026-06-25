import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { ViewRoot } from '../../aura-outlet/core/aura-outlet';
import type { ViewPayload, RouteViewConfig } from './ports';
import { createRenderPass, isStale, type RenderPass } from './render-pass';
import { RenderSignal } from './signal';
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
import { emptyContent, resolveError, resolveLayout, warnMissingLayoutOutlet } from './payloads';

type PluginHook = 'onPassStart' | 'onPassEnd' | 'onContentResolved' | 'onMounted' | 'onPassError';

/** Orchestrates render passes: stash restore, resolve, single mount, plugins. */
export class RouteViewCoordinator {
  private readonly config: RouteViewConfig;
  private readonly getPassId: () => number;
  private readonly signal = new RenderSignal();
  private mount: MountSnapshot = { ...EMPTY_MOUNT };

  constructor(config: RouteViewConfig, getPassId: () => number) {
    this.config = config;
    this.getPassId = getPassId;
  }

  get nestedOutlet() {
    return this.mount.nestedOutlet;
  }

  get abortSignal(): AbortSignal {
    return this.signal.signal;
  }

  beginPass(routeInfo: MatchedRouteInfo, parentSignal?: AbortSignal): RenderPass {
    const signal = this.signal.begin(parentSignal);
    return createRenderPass(this.getPassId(), this.config.route, routeInfo, signal);
  }

  async render(pass: RenderPass): Promise<void> {
    this.emit('onPassStart', pass);

    try {
      if (this.tryStashRestore(pass)) return;
      if (this.shouldSkipKeepAlive(pass)) return;
      await this.resolveAndMount(pass);
    } catch (error) {
      if (this.stale(pass)) return;
      this.emit('onPassError', pass, error);
      this.applyMount(pass, resolveError(this.config.route, error), 'content');
      throw error;
    } finally {
      this.emit('onPassEnd', pass);
    }
  }

  commitStagedView(): void {
    this.mount = commitStaged(this.mount);
  }

  onLeft(lastCacheKey: string | null): void {
    this.signal.cancel();

    const { keepAlive } = this.config.route;
    const { snapshot, detachedRoot } = unmountOnLeave(this.mount, keepAlive);
    this.mount = finalizeLeave(snapshot, keepAlive, detachedRoot);

    if (keepAlive && detachedRoot) {
      this.config.stash.put(lastCacheKey ?? this.config.route.path, detachedRoot);
    }
  }

  cancel(): void {
    this.signal.cancel();
  }

  cancelPendingRender(): void {
    this.mount = rollbackStaged(this.mount);
    this.signal.cancel();
  }

  async preload(): Promise<void> {
    await this.config.content.preload?.(this.signal.signal);
  }

  private tryStashRestore(pass: RenderPass): boolean {
    if (!this.config.route.keepAlive) return false;

    const cached = this.config.stash.extract(pass.cacheKey);
    if (!cached) return false;

    this.applyMount(pass, cached, pass.viewKind, cached);
    return true;
  }

  private shouldSkipKeepAlive(pass: RenderPass): boolean {
    return this.config.route.keepAlive
      && hasActiveMount(toMountSlice(this.mount), pass.viewKind === 'layout');
  }

  private async resolveAndMount(pass: RenderPass): Promise<void> {
    const payload = pass.viewKind === 'layout'
      ? resolveLayout(this.config.route)
      : await this.config.content.resolve(pass.routeInfo, pass.signal);

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
  ): void {
    if (this.stale(pass)) return;

    const ctx = this.mountContext(pass);
    const slice = cachedRoot
      ? reattachContent(ctx, cachedRoot)
      : mountContent(ctx, payload, toMountSlice(this.mount));

    if (!slice) return;

    this.mount = mergeMount(this.mount, slice);
    warnMissingLayoutOutlet(this.config.route, viewKind, slice.nestedOutlet);
    this.emit('onMounted', pass);
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
    return isStale(pass, this.getPassId, () => this.signal.aborted);
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
