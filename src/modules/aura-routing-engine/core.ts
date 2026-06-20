export type {
  NotFoundFallbackHandler,
  AuraRoutingEngineConfig,
} from './core/aura-routing-engine';

export { AuraRoutingEngine } from './core/aura-routing-engine';
export { AuraRoutingProcessor } from './core/aura-routing-processor';

export type {
  RouteMatch,
  NavigateOptions,
  GuardResult,
  NavigationContext,
  NavigationEvent,
  NavigationIntent,
  PhaseHandler,
  RoutePhaseHandlers,
  RouteRenderHandler,
  NavigationTransition,
  RouteRegistration,
  ProviderRouteRegistration,
  RoutingEngineBinding,
} from './core/types';

export { PHASE_PIPELINE } from './core/types';

export type {
  MatchedRouteInfo,
  CATCH_ALL_ROUTE_PATH,
} from './core/aura-routing-url-matcher';
export { isCatchAllRoute } from './core/aura-routing-url-matcher';
