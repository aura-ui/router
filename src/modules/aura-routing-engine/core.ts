/**
 * Public API of `aura-routing-engine`.
 *
 * Intended consumers: `aura-router`, `aura-route-hooks`, custom `NavigationProvider` / tests.
 *
 * **Not exported** (module-internal — import only from inside `core/`):
 * - `route-tree/` — nested tree, branch diff, `buildTransitionPlan` implementation
 * - `aura-routing-route-registry.ts` — route catalog snapshot
 * - `processor/processor-pipeline.ts`, `ProcessorPipeline`, `RouteHookRunner`, jobs
 * - `transition/plan.ts` — `TransitionMap`, `buildTransitionPlan` (used by processor only)
 */

// --- Engine + processor (wired by aura-router) ---

export type {
  NotFoundFallbackHandler,
  AuraRoutingEngineConfig,
} from './core/aura-routing-engine';

export { AuraRoutingEngine } from './core/aura-routing-engine';

export { AuraRoutingProcessor } from './core/processor/processor';
export type { ProcessorRunInput } from './core/processor/processor';

export type { NavigationErrorDetail, NavigationErrorPhase } from './core/processor/navigation-error.types';

// --- History layer (default provider + DI for tests) ---

export type {
  NavigationProvider,
  NavigationRequest,
  HistoryAction,
  NavigateHistoryOptions,
} from './core/history';

export { BrowserHistoryProvider, FakeHistoryProvider } from './core/history';

// --- Transition policy (aura-router attribute) ---

export type { TransitionPolicy } from './core/transition/policy';
export { DEFAULT_TRANSITION_POLICY, parseTransitionPolicy } from './core/transition/policy';

// --- Matcher + guards (shared with aura-route-hooks lifecycle ctx) ---

export type {
  MatchedRouteInfo,
  CATCH_ALL_SEGMENT,
} from './core/match/url-matcher';

export { isCatchAllRoute } from './core/match/url-matcher';

export type { GuardResult, RedirectTarget } from './core/guard.types';
