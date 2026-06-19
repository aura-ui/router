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
    const {route}  = routeInfo;
    const onAbort = () => route.cancelPendingRender();
    job.signal.addEventListener('abort', onAbort, { once: true });

    try {
      await route.render();
    } finally {
      job.signal.removeEventListener('abort', onAbort);
    }

    if (job.aborted) {
      throw new DOMException('Navigation aborted', 'AbortError');
    }
  }

  private static async runHooks(
    phase: string,
    hookNames: string[],
    routeInfo: MatchedRouteInfo,
    isJobActive: () => boolean,
  ): Promise<any> {
    try {
      const result = await RouteHookRegistry.run(phase, hookNames, routeInfo, { isJobActive });
      if (!isJobActive()) return false;
      return result;
    } catch (error) {
      if (!isJobActive()) return false;
      console.error(error); // todo add debug
      return false;
    }
  }
}