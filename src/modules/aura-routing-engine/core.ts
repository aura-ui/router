/**
 * Public API of `aura-routing-engine`.
 *
 * Intended consumers: `aura-router`, hook authors, custom `NavigationProvider` / tests.
 *
 * **Not exported** (module-internal — import only from inside `core/`):
 * - `route-tree/` — nested tree, branch diff, `TransitionMap`, `buildTransitionPlan`
 * - `aura-routing-route-registry.ts` — route catalog snapshot
 * - `failure/` — navigation errors and terminal failure outcomes
 * - `navigation/` — {@link TransactionResult} contract and terminal outcome finalization
 * - `route/types.ts` — route instance and lifecycle callback contract
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
} from './core/failure/navigation-error';

export { FailedNavigation } from './core/failure/navigation-failure';
export type {
  NavigationHookErrorDetail,
  ReportNavigationHookError,
} from './core/failure/navigation-failure';
export type { CompleteFailureDeps, CompleteFailureOutcome } from './core/failure/finalize-failure';

export type {
  NavigationFailureCode,
  NavigationErrorInit,
  NormalizeFailureContext,
} from './core/failure/navigation-error';

export {
  NavigationError,
  createContentLoadError,
  defaultCodeForPhase,
  isNavigationError,
  normalizeFailure,
} from './core/failure/navigation-error';

export type { CommitSnapshot, ViewCommitState } from './core/view-mount/view-mount-state';
export { isViewCommittedForHistory } from './core/view-mount/view-mount-state';
export type { ViewRenderResult } from './core/view-mount/view-render';

export type { TransactionResult, NavigationErrorResult } from './core/navigation/transaction-result';

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
  buildContentDescriptor,
  parseViewDescriptor,
} from './core/content/descriptor';
export { NO_PRESERVE, parsePreserveAttr } from './core/content/preserve';
export { contentCacheKey } from './core/content/content-key';
export { ContentCache } from './core/content/content-cache';
export { ContentResolver } from './core/content/content-resolver';
export { ContentLoadService } from './core/content/content-load-service';
export { LoaderRegistry, defaultLoaderRegistry } from './core/content/registry';

export type {
  ContentDescriptor,
  ContentKind,
  FetchText,
  LoaderFn,
  LoadPurpose,
  LoaderType,
  LoadContext,
  ResolveContext,
  ViewPayload,
} from './core/content/types';
export type { PreserveFlags } from './core/content/preserve';
export type { ParsedViewDescriptor } from './core/content/descriptor';
export type { ContentResolverDeps } from './core/content/content-resolver';
export type { ContentLoadServiceDeps } from './core/content/content-load-service';

export type { PrefetchConfig, PrefetchOptions, PrefetchMode } from './core/prefetch/types';

// --- Route hooks (registered via AuraRouter.use) ---

export { parsePhaseHooks, resolveHookNames } from './core/lifecycle/phase-attrs';
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
