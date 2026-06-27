/**
 * @deprecated Import from `aura-routing-engine/core` instead.
 */
export type {
  RoutePhase,
  RouteInfo,
  RouterInstance,
  RouteLifecycleContext,
  RouteErrorContext,
  RouteInstance,
  RouteHookContext,
  RouteHookDefinition,
  PhaseHooksMap,
  RouteTransition,
  HookResult,
  HookResultInput,
} from '../aura-routing-engine/core/hooks/types';

export type { MatchedRouteInfo, HistoryAction } from '../aura-routing-engine/core';

export { defineRouteHook } from '../aura-routing-engine/core/hooks/define-hook';
export { NO_TRANSITION } from '../aura-routing-engine/core/transition/route-transition';
export { RouteHookRegistry, defaultHookRegistry } from '../aura-routing-engine/core/hooks/registry';
export { parsePhaseHooks, routeHookNames } from '../aura-routing-engine/core/hooks/phases';
export { ROUTER_VERSION, satisfies } from '../aura-routing-engine/core/hooks/version';
