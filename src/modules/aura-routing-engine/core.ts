/**
 * Public API of `aura-routing-engine`.
 *
 * Intended consumers: `aura-router`, hook authors, custom `NavigationProvider` / tests.
 *
 * **Not exported** (module-internal — import only from inside `core/`):
 * - `route-tree/` — nested tree, branch diff, `buildTransitionPlan` implementation
 * - `aura-routing-route-registry.ts` — route catalog snapshot
 * - `processor/processor-pipeline.ts`, `ProcessorPipeline`, jobs
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

export type {
  NavigationErrorPhase,
  NavigationHookErrorDetail,
  ReportNavigationHookError,
} from './core/processor/navigation-error.types';

export { FailedNavigation } from './core/processor/failed-navigation';
export type { CompleteFailureDeps, CompleteFailureOutcome } from './core/processor/failed-navigation';

export type {
  NavigationFailureCode,
  NavigationErrorInit,
  NormalizeFailureContext,
} from './core/processor/navigation-error';

export {
  NavigationError,
  createContentLoadError,
  defaultCodeForPhase,
  isNavigationError,
  normalizeFailure,
} from './core/processor/navigation-error';

export type { CommitSnapshot, ViewCommitState } from './core/processor/commit-snapshot';
export { isViewCommittedForHistory } from './core/processor/commit-snapshot';

// --- History layer (default provider + DI for tests) ---

export type {
  NavigationProvider,
  NavigationRequest,
  HistoryAction,
  NavigateHistoryOptions,
} from './core/history';

export { BrowserHistoryProvider, FakeHistoryProvider } from './core/history';

// --- Transition order (route attrs → processor pipeline) ---

export type { TransitionPolicy } from './core/transition/policy';
export { DEFAULT_TRANSITION_POLICY, isTransitionPolicy, parseTransitionOrder, parseTransitionPolicy } from './core/transition/policy';

// --- Matcher + guards (shared with route hooks lifecycle ctx) ---

export type {
  MatchedRouteInfo,
  CATCH_ALL_SEGMENT,
} from './core/match/url-matcher';

export { isCatchAllRoute } from './core/match/url-matcher';

export type { GuardResult, RedirectTarget } from './core/guard.types';

// --- Content load (router-owned cache + prefetch) ---

export {
  ContentCache,
  ContentLoadService,
  ContentResolver,
  LoaderRegistry,
  defaultLoaderRegistry,
  buildContentDescriptor,
  contentDescriptorFromRoute,
  parseViewDescriptor,
  contentCacheKey,
} from './core/content';

export type {
  ContentDescriptor,
  ContentLoadServiceDeps,
  ContentResolverDeps,
  LoadPurpose,
  ParsedViewDescriptor,
  ViewPayload,
} from './core/content';

export type { PrefetchConfig, PrefetchOptions, PrefetchMode } from './core/prefetch';

// --- Route hooks (registered via AuraRouter.use) ---

export { parsePhaseHooks, resolveHookNames } from './core/hooks/phases';
export { defineRouteHook } from './core/hooks/define-hook';
export { NO_TRANSITION } from './core/transition/route-transition';
export {
  HookRegistry,
  defaultHookRegistry,
  runPhaseHooks,
} from './core/hooks/registry';
export { ROUTER_VERSION, satisfies } from './core/hooks/version';

export type {
  RoutePhase,
  LifecyclePhase,
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
} from './core/hooks/types';
