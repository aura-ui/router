import type { AuraOutlet, ViewHandle } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo, ViewRenderResult } from '../../../aura-routing-engine/route-api';
import type { RouteRenderOptions, MountResolvedViewOptions, RouteUnmountOptions } from '../types';

import { domCacheKey } from './dom-cache';
import type { RenderPass, RouteViewConfig, ViewPayload } from './types';
import { ViewContext } from './view-context';
import { ViewRenderPipeline } from './view-render-pipeline';
import { ViewTeardownPipeline } from './view-teardown-pipeline';

/**
 * View state and render orchestration for {@link AuraRoute}.
 *
 * Render flow: {@link ViewRenderPipeline}.
 * Teardown flow: {@link ViewTeardownPipeline}.
 * Mount primitives: {@link outlet-adapter}; view loading via {@link ViewResolverPort}.
 */
export class RouteViewController {
  private readonly ctx: ViewContext;
  private readonly renderPipeline: ViewRenderPipeline;
  private readonly teardownPipeline: ViewTeardownPipeline;

  constructor(config: RouteViewConfig, getPassId: () => number) {
    this.ctx = new ViewContext(config, getPassId);
    this.renderPipeline = new ViewRenderPipeline(this.ctx);
    this.teardownPipeline = new ViewTeardownPipeline(this.ctx);
  }

  get nestedOutlet(): AuraOutlet | null {
    return this.ctx.nestedOutlet;
  }

  get signal(): AbortSignal {
    return this.ctx.signal;
  }

  /** @internal Used by hydrate engine */
  adopt(handle: ViewHandle, routeInfo: MatchedRouteInfo) {
    this.ctx.mount.strategy = 'replace';
    this.ctx.mount.activeHandle = handle;
    this.ctx.mount.nestedOutlet = handle.findChildOutlet();
    this.ctx.mount.stageOutgoingHandle = null;
    this.ctx.mount.pendingOutgoingRoot = null;
    this.ctx.lastCacheKey = domCacheKey(routeInfo, this.ctx.config.route.path);
  }

  /**
   * Resolves and mounts route content (or restores a keep-alive view).
   * Returns `{ status: 'error' }` after mounting recovery UI — does not rethrow.
   */
  async resolveAndMountView(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<ViewRenderResult> {
    const pass = this.beginPass(routeInfo, options);
    this.ctx.lastCacheKey = pass.domCacheKey;
    return this.renderPipeline.resolveAndMount(pass);
  }

  /**
   * Sync mount with a pre-resolved payload — used by branch-atomic apply.
   * Parent→child calls must stay in one task (no `await` between routes).
   */
  mountResolvedView(routeInfo: MatchedRouteInfo, options: MountResolvedViewOptions): ViewRenderResult | 'aborted' {
    if (options.parentSignal?.aborted) return 'aborted';
    const pass = this.beginPass(routeInfo, options, options.preResolvedView);
    this.ctx.lastCacheKey = pass.domCacheKey;
    return this.renderPipeline.syncBranchMount(pass);
  }

  /**
   * Mount `loading-template` as pending incoming (`stage`) — committed view stays active.
   * Cancel → {@link AuraOutlet.cancelStage}; success → real mount replaces the staged skeleton.
   */
  mountLoadingTemplate(routeInfo: MatchedRouteInfo, payload: ViewPayload): ViewRenderResult | 'aborted' {
    const pass: RenderPass = {
      ...this.beginPass(routeInfo, undefined, payload),
      viewKind: 'view',
      useStagedMount: true,
    };
    this.ctx.lastCacheKey = pass.domCacheKey;
    const result = this.renderPipeline.syncBranchMount(pass);

    if (result !== 'aborted' && result.status === 'ok' && this.ctx.mount.strategy === 'stage') {
      this.ctx.mount.activeHandle?.mountOutlet.hideActive();
    }

    return result;
  }

  private beginPass(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions, preResolvedView?: ViewPayload | null): RenderPass {
    this.ctx.paramChangeRemount = options?.paramChangeRemount === true;
    const route = this.ctx.config.route;

    return {
      id: this.ctx.getPassId(),
      routeInfo,
      signal: this.ctx.renderSignal.begin(options?.parentSignal),
      domCacheKey: domCacheKey(routeInfo, route.path),
      viewKind: route.hasLayout ? 'layout' : 'view',
      useStagedMount:
        route.transition.order !== null
        || (this.ctx.paramChangeRemount && route.cache.dom),
      ...(options?.data !== undefined && { data: options.data }),
      ...(preResolvedView !== undefined && { preResolvedView }),
    };
  }

  commitStagedView(): void {
    this.teardownPipeline.commitStaged();
  }

  onUnmount(options?: RouteUnmountOptions): void {
    this.teardownPipeline.onUnmount(options);
  }

  cancel(): void {
    this.ctx.renderSignal.cancel();
  }

  revertInFlightView(): void {
    this.teardownPipeline.revertInFlight();
  }
}
