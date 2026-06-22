import { RouteHookRegistry } from '../../../aura-route-hooks/core/route-hook-registry';
import type { RouteLifecycleContext } from '../../../aura-route-hooks/core';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { GuardResult } from '../guard.types';
import type { AuraRoutingProcessorJob } from './job';

export class RouteHookRunner {

  /** Hooks из attr маршрута для `lifecycleContext.phase` (leave, enter, load, …). */
  static async runLifecycleHooks(
    lifecycleContext: RouteLifecycleContext,
    isJobActive: () => boolean,
  ): Promise<GuardResult> {
    const hookNames = lifecycleContext.route[lifecycleContext.phase];
    if (!hookNames?.length) return;
    return this.runNamedHooks(lifecycleContext, hookNames, isJobActive);
  }

  /** View commit: `route.render()` (не lifecycle hook; см. PHASE_NAMING). */
  static async runViewCommit(
    matchedRoute: MatchedRouteInfo,
    job: AuraRoutingProcessorJob,
  ): Promise<'aborted' | 'ok'> {
    if (job.aborted) return 'aborted';

    const { route } = matchedRoute;
    const cancelRenderOnAbort = () => route.cancelPendingRender();
    job.signal.addEventListener('abort', cancelRenderOnAbort, { once: true });

    try {
      await route.render(matchedRoute);
    } finally {
      job.signal.removeEventListener('abort', cancelRenderOnAbort);
    }

    return job.aborted ? 'aborted' : 'ok';
  }

  private static async runNamedHooks(
    lifecycleContext: RouteLifecycleContext,
    hookNames: string[],
    isJobActive: () => boolean,
  ): Promise<GuardResult> {
    try {
      const result = await RouteHookRegistry.run(lifecycleContext, hookNames, isJobActive);
      if (!isJobActive()) return false;
      return result;
    } catch (error) {
      if (!isJobActive()) return false;
      throw error;
    }
  }
}
