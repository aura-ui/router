export type {
  RoutePhase,
  MatchedRouteInfo,
  HistoryAction,
  RouteInfo,
  RouterInstance,
  RouteLifecycleContext,
  RouteErrorContext,
  RouteInstance,
  RouteHookContext,
  RouteHookDefinition,
  PhaseHooksMap,
} from './core/types';
export { defineRouteHook } from './core/types';
export { RouteHookRegistry } from './core/route-hook-registry';
export { parsePhaseHooks, routeHookNames } from './core/phase-hooks';
export { ROUTER_VERSION, satisfies } from './core/version';
