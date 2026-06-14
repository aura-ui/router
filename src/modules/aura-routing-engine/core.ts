export type {
  RouteMatch,
  NavigateOptions,
  RoutingEngineConfig,
  GuardResult,
  NavigationContext,
  PhaseHandler,
  RoutePhaseHandlers,
  RouteRenderHandler,
  NotFoundHandler,
  NavigationTransition,
  RouteRegistration,
  ProviderRouteRegistration,
  RoutingEngineBinding,
} from './core/types';

export { PHASE_PIPELINE } from './core/types';

export type { NavigoRoutingStrategy, NavigoProviderConfig } from './core/providers/navigo-config';

export type { RoutingEngineOptions } from './core/routing-engine';

export type {
  RoutingEngineProvider,
  RoutingProviderFactory,
} from './core/provider';

export { RoutingProviderRegistry } from './core/provider-registry';
export { RoutingEngine } from './core/routing-engine';
