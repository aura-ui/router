export type {
  RoutePhase,
  MatchedRouteInfo,
  RouteErrorContext,
  RouteInstance,
  RouteHookContext,
  RouteHookDefinition,
} from './core/types';
export { defineRouteHook } from './core/types';
export { RouteHookRegistry } from './core/route-hook-registry';
export { ROUTER_VERSION, satisfies } from './core/version';
