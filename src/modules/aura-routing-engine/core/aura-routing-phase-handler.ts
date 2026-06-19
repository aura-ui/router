import type { MatchedRouteInfo } from './aura-routing-engine';
import { RouteHookRegistry } from '../../aura-route-hooks/core/route-hook-registry';

export class AuraRoutingPhaseHandler {

  static async runPhase(phaseName: string, routeInfo: MatchedRouteInfo, isJobActive: any): Promise<any> {
    // @ts-ignore
    const hookNames = routeInfo.route[phaseName];
    if(!hookNames) return;
    return this.runHooks(phaseName, hookNames, routeInfo, isJobActive);
  }

  static async runRenderPhase(routeInfo: MatchedRouteInfo, job: any): Promise<any> {
    if (job.aborted) return 'aborted';

    const {route}  = routeInfo;

    const onAbort = () => route.cancelPendingRender();
    job.signal.addEventListener('abort', onAbort, { once: true });

    try {
      await route.render();
    } finally {
      job.signal.removeEventListener('abort', onAbort);
    }

    return job.aborted ? 'aborted' : 'ok';
  }

  private static async runHooks(
    phase: string,
    hookNames: string[],
    routeInfo: MatchedRouteInfo,
    isJobActive: () => boolean,
  ): Promise<any> {
    try {
      const result = await RouteHookRegistry.run(phase, hookNames, routeInfo, { isJobActive });
      // superseded / invalidate — не error, а «отмена»
      if (!isJobActive()) return false;

      return result;
    } catch (error) {
      if (!isJobActive()) return false;
      throw error; // активный job — пробрасываем наверх
    }
  }
}