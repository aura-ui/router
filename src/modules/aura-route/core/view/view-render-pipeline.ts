import type { ViewRenderResult } from '../../../aura-routing-engine/route-api';
import { type RenderPass } from './types';
import type { ViewContext } from './view-context';
import { ViewRenderPipelinePhase } from './view-render-pipeline-phase';

/**
 * Render pass pipeline: cache → skip → resolve → mount (async)
 * or direct mount (sync via {@link syncBranchMount}).
 *
 * Terminal `ViewRenderResult` ends the pass; `null` means continue to the next step.
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

    if (pass.preResolvedContent === undefined) {
      return {
        status: 'error',
        error: new Error('syncBranchMount requires preResolvedContent on pass'),
      };
    }

    try {
      const early = this.tryEarlyExit(pass); // tryCacheRestore ?? trySkipAlreadyMounted
      if (early) return early;

      this.phase.applyResolvedContent(pass, pass.preResolvedContent);
      return { status: 'ok' };
    } catch (error) {
      return this.phase.handleError(pass, error);
    }
  }

  async resolveAndMount(pass: RenderPass): Promise<ViewRenderResult> {
    let loadingHooks = false;

    try {
      const early = this.tryEarlyExit(pass);
      if (early) return early;

      this.fireLoadingStart(pass);
      loadingHooks = true;

      await this.phase.resolveContent(pass);
      return { status: 'ok' };
    } catch (error) {
      return this.phase.handleError(pass, error);
    } finally {
      if (loadingHooks) {
        this.fireLoadingEnd(pass);
      }
    }
  }

  private tryEarlyExit(pass: RenderPass): ViewRenderResult | null {
    return this.phase.tryCacheRestore(pass) ?? this.phase.trySkipAlreadyMounted(pass);
  }

  private fireLoadingStart(pass: RenderPass): void {
    const plugins = this.ctx.config.plugins;
    if (!plugins) return;
    for (let i = 0; i < plugins.length; i++) {
      plugins[i]!.onLoadingStart?.(pass);
    }
  }

  private fireLoadingEnd(pass: RenderPass): void {
    const plugins = this.ctx.config.plugins;
    if (!plugins) return;
    for (let i = 0; i < plugins.length; i++) {
      plugins[i]!.onLoadingEnd?.(pass);
    }
  }
}
