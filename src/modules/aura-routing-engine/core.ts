/**
 * Public API of `aura-routing-engine`.
 *
 * Intended consumers: `aura-router`, hook authors, custom `NavigationProvider` / tests.
 * Architecture overview: `core/ARCHITECTURE.md`.
 *
 * **Implementation modules not exported from this barrel:**
 * - `route-tree/` — nested tree, branch diff implementation, `TransitionMap`, `buildTransitionPlan`
 * - `aura-routing-route-registry.ts` — route catalog snapshot
 * - `navigation/coordinator.ts`, `navigation/finalize.ts` — matched navigation orchestration/finalization
 * - `view-mount/` — tracker/render impl (types partially exported below)
 * - `processor/processor-pipeline.ts`, `ProcessorPipeline`, jobs
 */

// --- Engine + processor (wired by aura-router) ---

export type {
  NotFoundFallbackHandler,
  AuraRoutingEngineConfig,
} from './core/aura-routing-engine';

export { AuraRoutingEngine } from './core/aura-routing-engine';

export { AuraRoutingProcessor } from './core/processor/processor';
export type { ProcessorRunInput } from './core/processor/types';

export type {
  NavigationErrorPhase,
} from './core/failure';

export { FailedNavigation } from './core/failure';
export type {
  NavigationHookErrorDetail,
  ReportNavigationHookError,
} from './core/failure';
export type { CompleteFailureDeps, CompleteFailureOutcome } from './core/failure';

export type {
  NavigationFailureCode,
  NavigationErrorInit,
  NormalizeFailureContext,
} from './core/failure';

export {
  NavigationError,
  createContentLoadError,
  defaultCodeForPhase,
  isNavigationError,
  normalizeFailure,
} from './core/failure';

export type { ViewCommitSnapshot, ViewCommitState } from './core/view-mount/view-commit-state';
export { isViewCommittedForHistory } from './core/view-mount/view-commit-state';
export type { ViewRenderResult } from './core/view-mount/view-commit-render';

export type { TransactionResult, NavigationErrorResult } from './core/navigation/transaction-result';
export type { NavigationCommittedContext } from './core/navigation/commit-gate';
export {
  DEFAULT_SCROLL_POLICY,
  parseScrollPolicy,
  resolveRouteScrollPolicy,
  resolveScrollPolicy,
} from './core/navigation/scroll-policy';
export type { ScrollPolicy, ScrollPolicySource } from './core/navigation/scroll-policy';

// --- History layer (default provider + DI for tests) ---

export type {
  NavigationProvider,
  NavigationRequest,
  HistoryAction,
  NavigateHistoryOptions,
} from './core/history/provider.types';

export { BrowserHistoryProvider } from './core/history/browser-provider';
export { FakeHistoryProvider } from './core/history/fake-provider';

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
  NO_PRESERVE,
  parsePreserveAttr,
  contentCacheKey,
  ContentCache,
  ContentLoadService,
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
  createBuiltinLoaders,
  toLoadContext,
  routeSnapshot,
  fetchText,
  resolveRelativeUrl,
} from './core/content';

export type {
  ContentDescriptor,
  ContentKind,
  FetchText,
  LoaderFn,
  LoaderTransport,
  LoaderType,
  LoadContext,
  ViewPayload,
  PreserveFlags,
  ContentLoadServiceDeps,
  ContentPrefetchOptions,
} from './core/content';

export type { PrefetchConfig, PrefetchOptions, PrefetchMode } from './core/prefetch/types';

// --- Route hooks (registered via AuraRouter.use) ---

export { parsePhaseHooks, resolveHookNames } from './core/lifecycle';
export { defineRouteHook } from './core/hooks/define-hook';
export { NO_TRANSITION } from './core/transition/route-transition';
export {
  HookRegistry,
  defaultHookRegistry,
  runPhaseHooks,
} from './core/hooks/registry';
export { ROUTER_VERSION, satisfies } from './core/hooks/version';

export type {
  RouteInfo,
  RouterInstance,
  RouteLifecycleContext,
  RouteErrorContext,
  RouteInstance,
  RouteHookNamesSource,
} from './core/route/types';

export type {
  RoutePhase,
  LifecyclePhase,
  RouteHookContext,
  RouteHookDefinition,
  PhaseHooksMap,
  HookResult,
  HookResultInput,
} from './core/hooks/types';
export type { RouteTransition } from './core/transition/route-transition';
