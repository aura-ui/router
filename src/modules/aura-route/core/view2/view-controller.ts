import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type {
  MatchedRouteInfo,
  ViewRenderResult,
} from '../../../aura-routing-engine/route-api';

import type { RouteRenderOptions, RouteUnmountOptions } from '../types';
import type { RouteViewConfig } from '../view/ports';
import type { RenderPass } from '../view/render-pass';
import { cacheKey } from '../view/view-cache';

import { ViewContext } from './view-context';
import { ViewRenderPipeline } from './view-render-pipeline';
import { ViewTeardownPipeline } from './view-teardown-pipeline';

/**
 * View state and render orchestration for {@link AuraRoute}.
 *
 * Render flow: {@link ViewRenderPipeline}.
 * Teardown flow: {@link ViewTeardownPipeline}.
 * Mount primitives: `view/outlet.ts`; content loading via {@link ContentResolverPort}.
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
    this.ctx.paramChangeRemount = options?.paramChangeRemount === true;
    const route = this.ctx.config.route;

    const pass: RenderPass = {
      id: this.ctx.getPassId(),
      routeInfo,
      signal: this.ctx.renderSignal.begin(options?.parentSignal),
      cacheKey: cacheKey(routeInfo, route.path),
      viewKind: route.layout.trim() ? 'layout' : 'content',
      useStagedMount:
        route.transition.order !== null
        || (this.ctx.paramChangeRemount && route.preserve.view),
      ...(options?.data !== undefined && { data: options.data }),
    };

    this.ctx.lastCacheKey = pass.cacheKey;
    return this.renderPipeline.run(pass);
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
