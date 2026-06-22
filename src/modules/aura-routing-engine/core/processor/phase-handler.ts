import { RouteHookRegistry } from '../../../aura-route-hooks/core/route-hook-registry';
import type { RouteLifecycleContext } from '../../../aura-route-hooks/core';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { AuraRoutingProcessorJob } from './job';

export class AuraRoutingPhaseHandler {

  static async runPhase(
    lifecycleContext: RouteLifecycleContext,
    isJobActive: () => boolean,
  ): Promise<boolean | void | string | undefined> {
    const hookNames = lifecycleContext.route[lifecycleContext.phase];
    if (!hookNames?.length) return;
    return this.runHooks(lifecycleContext, hookNames, isJobActive);
  }

  static async runRenderPhase(routeInfo: MatchedRouteInfo, job: AuraRoutingProcessorJob): Promise<'aborted' | 'ok'> {
    if (job.aborted) return 'aborted';

    const { route } = routeInfo;
    const onAbort = () => route.cancelPendingRender();
    job.signal.addEventListener('abort', onAbort, { once: true });

    try {
      await route.render(routeInfo);
    } finally {
      job.signal.removeEventListener('abort', onAbort);
    }

    return job.aborted ? 'aborted' : 'ok';
  }

  private static async runHooks(
    lifecycleContext: RouteLifecycleContext,
    hookNames: string[],
    isJobActive: () => boolean,
  ): Promise<boolean | void | string | undefined> {
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
