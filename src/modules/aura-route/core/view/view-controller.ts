import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo, ViewRenderResult } from '../../../aura-routing-engine/route-api';
import type { RouteRenderOptions, ApplyPreResolvedOptions, RouteUnmountOptions } from '../types';
import type { RenderPass, RouteViewConfig, ViewPayload } from './types';
import { domCacheKey } from './dom-cache';

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

  /**
   * Resolves and mounts route content (or restores a keep-alive view).
   * Returns `{ status: 'error' }` after mounting recovery UI — does not rethrow.
   */
  async render(routeInfo: MatchedRouteInfo, options?: RouteRenderOptions): Promise<ViewRenderResult> {
    const pass = this.beginPass(routeInfo, options);
    this.ctx.lastCacheKey = pass.domCacheKey;
    return this.renderPipeline.resolveAndMount(pass);
  }

  /**
   * Sync mount with a pre-resolved payload — used by branch-atomic apply.
   * Parent→child calls must stay in one task (no `await` between routes).
   */
  applyPreResolved(
    routeInfo: MatchedRouteInfo,
    options: ApplyPreResolvedOptions,
  ): ViewRenderResult | 'aborted' {
    if (options.parentSignal?.aborted) return 'aborted';
    const pass = this.beginPass(routeInfo, options, options.preResolvedView);
    this.ctx.lastCacheKey = pass.domCacheKey;
    return this.renderPipeline.syncBranchMount(pass);
  }

  private beginPass(
    routeInfo: MatchedRouteInfo,
    options?: RouteRenderOptions,
    preResolvedView?: ViewPayload | null,
  ): RenderPass {
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
