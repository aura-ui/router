import type { HistoryAction } from '../../history/provider.types';
import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { RouteInfo, RouteLifecycleContext, RouterInstance } from '../../route/types';
import type { RoutePhase } from '../types';

/** Minimal cancellable job slice required by lifecycle callbacks and hooks. */
export interface LifecycleJobSlice {
  id: number;
  signal: AbortSignal;
}

/** Minimal navigation slice for building {@link RouteLifecycleContext}. */
export interface LifecycleContextInput {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
  navigationJob: LifecycleJobSlice;
}

/** {@link RouteInfo} slice for hook ctx (`to` / `from`). */
export function toRouteInfo(matchedRoute: MatchedRouteInfo): RouteInfo {
  return {
    pathname: matchedRoute.pathname,
    ...(matchedRoute.params && { params: matchedRoute.params }),
    ...(matchedRoute.query && { query: matchedRoute.query }),
  };
}

/** Builds {@link RouteLifecycleContext} for a route on the current branch. */
export function createLifecycleContext(
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
    jobId: input.navigationJob.id,
    signal: input.navigationJob.signal,
    ...(error !== undefined && { error }),
  };
}
