import type { ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import type { ViewRenderResult } from '../../../aura-routing-engine/route-api';

import {
  hasActiveMount,
  mergeMount,
  mountContent,
  reattachContent,
  toMountSlice,
  type MountContext,
} from './outlet-adapter';
import { emptyContent, resolveError, warnMissingLayoutOutlet } from './payloads';
import type { RenderPass, ViewPayload } from './types';
import type { ViewContext } from './view-context';

/**
 * One render-pass step: cache, skip, resolve, mount, error recovery.
 * Mutates {@link ViewContext.mount}; does not own orchestration order.
 */
export class ViewRenderPipelinePhase {
  private readonly ctx: ViewContext;

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  /** Keep-alive cache hit — returns `ok` when DOM was reattached, `null` to continue. */
  tryCacheRestore(pass: RenderPass): ViewRenderResult | null {
    if (!this.ctx.config.route.preserve.view) return null;

    const cachedRoot = this.ctx.config.cache.extract(pass.cacheKey);
    if (!cachedRoot) return null;

    return this.mountPayload(pass, cachedRoot, pass.viewKind, cachedRoot)
      ? { status: 'ok' }
      : null;
  }

  /** Active keep-alive view already in outlet — skip fetch/mount. */
  trySkipAlreadyMounted(pass: RenderPass): ViewRenderResult | null {
    if (this.ctx.paramChangeRemount) return null;

    const keepAlive = this.ctx.config.route.preserve.view;
    const layout = pass.viewKind === 'layout';
    if (keepAlive && hasActiveMount(toMountSlice(this.ctx.mount), layout)) {
      return { status: 'ok' };
    }

    return null;
  }

  /** Load content via port, then mount (or empty placeholder for null content routes). */
  async resolveContent(pass: RenderPass): Promise<void> {
    const payload = await this.ctx.config.content.resolve(
      pass.routeInfo,
      pass.signal,
      pass.data !== undefined ? { data: pass.data } : undefined,
    );

    if (this.isStale(pass)) return;

    if (payload == null) {
      if (pass.viewKind === 'content') {
        this.mountPayload(pass, emptyContent(), 'content');
      }
      return;
    }

    const plugins = this.ctx.config.plugins;
    if (plugins) {
      for (let i = 0; i < plugins.length; i++) {
        plugins[i]!.onContentResolved?.(pass, payload);
      }
    }

    this.mountPayload(pass, payload, pass.viewKind);
  }

  /** Recovery UI after resolve failure — does not rethrow. */
  handleError(pass: RenderPass, error: unknown): ViewRenderResult {
    if (this.isStale(pass)) return { status: 'ok' };

    const plugins = this.ctx.config.plugins;
    if (plugins) {
      for (let i = 0; i < plugins.length; i++) {
        plugins[i]!.onPassError?.(pass, error);
      }
    }

    this.mountPayload(pass, resolveError(this.ctx.config.route, error), 'content');
    return { status: 'error', error };
  }

  mountPayload(
    pass: RenderPass,
    payload: ViewPayload | ViewRoot,
    viewKind: RenderPass['viewKind'],
    cachedRoot?: ViewRoot,
  ): boolean {
    if (this.isStale(pass)) return false;

    const mountCtx = this.buildMountContext(pass);
    const slice = cachedRoot
      ? reattachContent(mountCtx, cachedRoot)
      : mountContent(mountCtx, payload as ViewPayload);

    if (!slice?.activeHandle) return false;

    this.ctx.mount = mergeMount(this.ctx.mount, slice);
    warnMissingLayoutOutlet(this.ctx.config.route, viewKind, slice.nestedOutlet);

    const plugins = this.ctx.config.plugins;
    if (plugins) {
      for (let i = 0; i < plugins.length; i++) {
        plugins[i]!.onMounted?.(pass);
      }
    }

    return true;
  }

  private isStale(pass: RenderPass): boolean {
    return this.ctx.renderSignal.aborted || this.ctx.getPassId() !== pass.id;
  }

  private buildMountContext(pass: RenderPass): MountContext {
    const { mountTarget } = this.ctx.config;
    return {
      pattern: pass.routeInfo.pattern,
      appOutlet: mountTarget.appOutlet(),
      mountOutlet: mountTarget.nestedOutlet(pass.routeInfo),
      signal: pass.signal,
      useStagedMount: pass.useStagedMount,
    };
  }
}
