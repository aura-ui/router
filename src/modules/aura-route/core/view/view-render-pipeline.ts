import type { ViewRenderResult } from '../../../aura-routing-engine/route-api';

import { type RenderPass } from './types';
import type { ViewContext } from './view-context';
import { ViewRenderPipelinePhase } from './view-render-pipeline-phase';

/**
 * Render pass pipeline: cache → skip → resolve → mount (async)
 * or direct mount (sync via {@link syncBranchMount}).
 *
 * Terminal `ViewRenderResult` ends the pass; `null` means continue to the next step.
 *
 * Loading chrome (template / body class / events) is owned by the navigation prepare
 * window (`showLoading` / `hideLoading` around `runLoads`), not this pipeline.
 */
export class ViewRenderPipeline {
  private readonly ctx: ViewContext;
  private readonly phase: ViewRenderPipelinePhase;

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
    this.phase = new ViewRenderPipelinePhase(ctx);
  }

  /**
   * Branch-atomic sync mount — applies payload as-is.
   */
  syncBranchMount(pass: RenderPass): ViewRenderResult | 'aborted' {
    if (this.ctx.renderSignal.aborted) return 'aborted';

    if (pass.preResolvedView === undefined) {
      return {
        status: 'error',
        error: new Error('syncBranchMount requires preResolvedView on pass'),
      };
    }

    try {
      const early = this.tryEarlyExit(pass); // tryCacheRestore ?? trySkipAlreadyMounted
      if (early) return early;

      this.phase.applyResolvedContent(pass, pass.preResolvedView);
      return { status: 'ok' };
    } catch (error) {
      return this.phase.handleError(pass, error);
    }
  }

  async resolveAndMount(pass: RenderPass): Promise<ViewRenderResult> {
    try {
      const early = this.tryEarlyExit(pass);
      if (early) return early;

      await this.phase.resolveContent(pass);
      return { status: 'ok' };
    } catch (error) {
      return this.phase.handleError(pass, error);
    }
  }

  private tryEarlyExit(pass: RenderPass): ViewRenderResult | null {
    return this.phase.tryCacheRestore(pass) ?? this.phase.trySkipAlreadyMounted(pass);
  }
}
