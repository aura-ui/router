export type {
  RouteMatch,
  NavigateOptions,
  RoutingEngineConfig,
  GuardResult,
  NavigationContext,
  NavigationEvent,
  NavigationIntent,
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

export { NavigoProvider, createNavigoProvider } from './core/providers/navigo-provider';

export type { RoutingEngineOptions, NavigationHandler } from './core/routing-engine';

export type {
  RoutingEngineProvider,
  RoutingProviderFactory,
} from './core/provider';

export { RoutingProviderRegistry } from './core/provider-registry';
export { RoutingEngine } from './core/routing-engine';

import { registerBuiltInProviders } from './core/providers';

registerBuiltInProviders();
