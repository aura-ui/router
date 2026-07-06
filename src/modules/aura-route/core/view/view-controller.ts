import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo, ViewRenderResult } from '../../../aura-routing-engine/route-api';
import type { RouteRenderOptions, ApplyPreResolvedOptions, RouteUnmountOptions } from '../types';
import type { RenderPass, RouteViewConfig, ViewPayload } from './types';
import { cacheKey } from './view-cache';

import { ViewContext } from './view-context';
import { ViewRenderPipeline } from './view-render-pipeline';
import { ViewTeardownPipeline } from './view-teardown-pipeline';

/**
 * View state and render orchestration for {@link AuraRoute}.
 *
 * Render flow: {@link ViewRenderPipeline}.
 * Teardown flow: {@link ViewTeardownPipeline}.
 * Mount primitives: {@link outlet-adapter}; content loading via {@link ContentResolverPort}.
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
    this.ctx.lastCacheKey = pass.cacheKey;
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
    const pass = this.beginPass(routeInfo, options, options.preResolvedContent);
    this.ctx.lastCacheKey = pass.cacheKey;
    return this.renderPipeline.syncBranchMount(pass);
  }

  private beginPass(
    routeInfo: MatchedRouteInfo,
    options?: RouteRenderOptions,
    preResolvedContent?: ViewPayload | null,
  ): RenderPass {
    this.ctx.paramChangeRemount = options?.paramChangeRemount === true;
    const route = this.ctx.config.route;

    return {
      id: this.ctx.getPassId(),
      routeInfo,
      signal: this.ctx.renderSignal.begin(options?.parentSignal),
      cacheKey: cacheKey(routeInfo, route.path),
      viewKind: route.layout.trim() ? 'layout' : 'content',
      useStagedMount:
        route.transition.order !== null
        || (this.ctx.paramChangeRemount && route.preserve.view),
      ...(options?.data !== undefined && { data: options.data }),
      ...(preResolvedContent !== undefined && { preResolvedContent }),
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
