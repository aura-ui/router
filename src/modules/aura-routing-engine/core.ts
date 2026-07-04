/**
 * Public API of `aura-routing-engine`.
 *
 * Intended consumers: `aura-router`, hook authors, custom `NavigationProvider` / tests.
 * Architecture overview: `core/ARCHITECTURE.md`.
 *
 * **Implementation modules not exported from this barrel:**
 * - `route-tree/` — nested tree, branch diff implementation, `TransitionMap`, `buildTransitionPlan`
 * - `aura-routing-route-registry.ts` — route catalog snapshot
 * - `navigation/` — coordinator, transaction, pipeline, history finalize, scroll policy
 * - `navigation/finalize.ts` — history policy after terminal outcomes
 * - `view-mount/` — tracker/render impl (types partially exported below)
 */

// --- Engine (wired by aura-router) ---

export type {
  NotFoundFallbackHandler,
  AuraRoutingEngineConfig,
} from './core/aura-routing-engine';

export { AuraRoutingEngine } from './core/aura-routing-engine';

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

export type { TransactionResult, TransactionFullResult, NavigationErrorResult } from './core/navigation/transaction-result';
export type { NavigationCommittedContext } from './core/navigation/finalize';
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
  dataCacheKey,
  DataCache,
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
export {
  DEFAULT_ROUTER_PREFETCH_MODE,
  readLinkPrefetchOverride,
  resolvePrefetchEngineConfig,
  resolvePrefetchMode,
} from './core/prefetch/prefetch-policy';
export type { RouterPrefetchPolicy } from './core/prefetch/prefetch-policy';

// --- Data graph (load hooks + SWR cache) ---

export { DataGraph } from './core/data-graph';
export type {
  DataGraphLoadOptions,
  DataGraphLoadResult,
  DataGraphOptions,
  DataGraphPrefetchOptions,
  DataSnapshot,
} from './core/data-graph';
export type { RouterDataInvalidateOptions } from './core/data-graph/invalidate';

// --- Route hooks (registered via AuraRouter.use) ---

export { resolveHookNames } from './core/lifecycle';
export { defineRouteHook } from './core/hooks/define-hook';
export { NO_TRANSITION } from '../aura-route/core/attr/transition-attr-parser';
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
  HookResult,
  HookResultInput,
} from './core/hooks/types';
export type { RouteTransitionType as RouteTransition } from '../aura-route/core/attr/transition-attr-parser';
