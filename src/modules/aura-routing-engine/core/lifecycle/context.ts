import type { HistoryAction } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { AuraRoutingProcessorJob } from '../processor/cancellation/job';
import type { RouteInfo, RouteLifecycleContext, RouterInstance } from '../route/types';
import type { RoutePhase } from './types';

/** Minimal navigation slice for building {@link RouteLifecycleContext}. */
export interface LifecycleContextInput {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
  job: AuraRoutingProcessorJob;
}

/** {@link RouteInfo} slice for hook ctx (`to` / `from`). */
export function toRouteInfo(matchedRoute: MatchedRouteInfo): RouteInfo {
  return {
    pathname: matchedRoute.pathname,
    ...(matchedRoute.params && { params: matchedRoute.params }),
    ...(matchedRoute.query && { query: matchedRoute.query }),
  };
}

/**
 * Builds {@link RouteLifecycleContext} for a route on the current branch.
 */
export function toLifecycleContext(
  lifecyclePhase: RoutePhase,
  matchedRoute: MatchedRouteInfo,
  input: LifecycleContextInput,
  error?: unknown,
): RouteLifecycleContext {
  return {
    phase: lifecyclePhase,
    from: input.from ? toRouteInfo(input.from) : null,
    to: toRouteInfo(matchedRoute),
    router: input.router,
    route: matchedRoute.route,
    action: input.action,
    jobId: input.job.id,
    signal: input.job.signal,
    ...(error !== undefined && { error }),
  };
}
