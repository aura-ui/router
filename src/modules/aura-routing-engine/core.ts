export type {
  NotFoundFallbackHandler,
  AuraRoutingEngineConfig,
  HistoryAction,
  NavigateHistoryOptions,
} from './core/aura-routing-engine';

export { AuraRoutingEngine } from './core/aura-routing-engine';
export { AuraRoutingProcessor } from './core/aura-routing-processor';

export type {
  NavigationProvider,
  NavigationRequest,
} from './core/navigation-provider.types';

export { BrowserHistoryProvider } from './core/providers/browser-history-provider';
export { FakeHistoryProvider } from './core/providers/fake-history-provider';

export type { TransitionPolicy } from './core/aura-routing-transition-policy';
export { DEFAULT_TRANSITION_POLICY, parseTransitionPolicy } from './core/aura-routing-transition-policy';

export type { GuardResult, RedirectTarget } from './core/types';

export type {
  MatchedRouteInfo,
  CATCH_ALL_ROUTE_PATH,
} from './core/aura-routing-url-matcher';
export { isCatchAllRoute } from './core/aura-routing-url-matcher';
