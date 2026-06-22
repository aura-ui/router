export type {
  NotFoundFallbackHandler,
  AuraRoutingEngineConfig,
  HistoryAction,
  NavigateHistoryOptions,
  NavigationErrorDetail,
  NavigationErrorPhase,
} from './core/aura-routing-engine';

export { AuraRoutingEngine } from './core/aura-routing-engine';
export { AuraRoutingProcessor } from './core/processor/processor';

export type {
  NavigationProvider,
  NavigationRequest,
  HistoryAction,
  NavigateHistoryOptions,
} from './core/history';

export { BrowserHistoryProvider, FakeHistoryProvider } from './core/history';

export type { TransitionPolicy } from './core/transition/policy';
export { DEFAULT_TRANSITION_POLICY, parseTransitionPolicy } from './core/transition/policy';

export type { GuardResult, RedirectTarget } from './core/guard.types';

export type {
  MatchedRouteInfo,
  CATCH_ALL_ROUTE_PATH,
} from './core/match/url-matcher';
export { isCatchAllRoute } from './core/match/url-matcher';
