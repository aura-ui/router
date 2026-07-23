/**
 * Public API of `aura-routing-engine`.
 *
 * Intended consumers: `aura-router`, hook authors, custom `NavigationProvider` / tests.
 * Architecture overview: `core/ARCHITECTURE.md`.
 *
 * **Implementation modules not exported from this barrel:**
 * - `route-tree/` — nested tree, branch diff implementation, `TransitionMap`, `buildTransitionPlan`
 * - `aura-routing-route-registry.ts` — route catalog snapshot
 * - `navigation/` — coordinator, transaction, pipeline, outcome apply
 * - `view-mount/` — tracker/render impl (types partially exported below)
 */

// --- Engine (wired by aura-router) ---

export type {
  AuraRoutingEngineConfig,
  ResolvedAuraRoutingEngineConfig,
} from './core/aura-routing-engine-config';

export {
  ENGINE_DEFAULTS,
  resolveAuraRoutingEngineConfig,
} from './core/aura-routing-engine-config';

export { AuraRoutingEngine } from './core/aura-routing-engine';

export { EventBus } from './core/events';
export type {
  EngineEvent,
  EngineEventListener,
  EngineEventType,
  UrlAlignedSource,
} from './core/events';
export { NavigationPulse } from './core/navigation/navigation-pulse';

export type {
  NavigationErrorPhase,
} from './core/failure';

export { NavigationFailure } from './core/failure';
export type {
  NavigationHookErrorDetail,
  ReportNavigationHookError,
} from './core/failure';
export type {
  NotFoundCallbacks,
  CompleteFailureDeps,
} from './core/navigation/navigation-outcome';

export type {
  NavigationFailureCode,
  NavigationErrorInit,
  NormalizeNavigationErrorContext,
} from './core/failure';

export {
  NavigationError,
  createViewLoadError,
  defaultCodeForPhase,
  isNavigationError,
  normalizeNavigationError,
} from './core/failure';

export type { ViewCommitSnapshot, ViewCommitState } from './core/view-mount/view-commit-state';
export { isViewCommittedForHistory } from './core/view-mount/view-commit-state';
export type { ViewRenderResult } from './core/view-mount/view-commit-render';
export { mountEnterBranch } from './core/view-mount/branch-mount';
export type {
  BranchMountContext,
  MountEnterBranchResult,
} from './core/view-mount/branch-mount';

export type {
  TransactionResult,
  PipelineStepResult,
  NavigationErrorResult,
  NavigationShortCircuit,
  NavigationCommittedContext,
} from './core/navigation/types';

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

export { isCatchAllRoutePattern } from './core/match/url-matcher';
export { dataKey, viewKey, viewKeyWithData, resourceKeys } from './core/match/resource-keys';

export type { GuardResult, RedirectTarget } from './core/guard.types';

// --- View graph (view payloads: load, prefetch, payload cache) ---

export {
  ViewGraph,
  Loader,
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
} from './core/view-graph';

export { TemplateLoader } from './core/view-graph/loaders/template';
export { HtmlLoader } from './core/view-graph/loaders/html';
export { UrlLoader } from './core/view-graph/loaders/url';
export { ComponentLoader } from './core/view-graph/loaders/component';
export { ImportLoader } from './core/view-graph/loaders/import';
export { IframeLoader } from './core/view-graph/loaders/iframe';

export { routeSnapshot, componentMarkup } from './core/view-graph/markup';
export {
  createBrowserEnvironment,
  defaultEnvironment,
  fetchText,
  resolveRelativeUrl,
} from './core/view-graph/environment';

export type {
  ViewGraphDeps,
  ViewGraphCacheOptions,
  ViewPrefetchOptions,
  ViewLoadOptions,
  ViewDataInput,
  ViewGraphLoadResult,
  ViewGraphLoadViewsResult,
  ViewLoadPort,
  ViewResolverPort,
  LoaderClass,
  ViewLoaderEnv,
  ViewDescriptor,
  ViewKind,
  ViewLoadResult,
  FetchText,
  LoaderFn,
  RegisterLoaderOptions,
  ViewLoadContext,
  ViewPayload,
} from './core/view-graph';

export type { LoaderId } from '../aura-route/core/attr/view-attr-parser';

export {
  ALL_CACHE,
  DEFAULT_CACHE,
  DOM_CACHE,
  NO_CACHE,
  parseCacheAttr,
} from '../aura-route/core/attr/cache-attr-parser';
export type { CacheFlags } from '../aura-route/core/attr/cache-attr-parser';

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
  DataGraphCacheOptions,
  DataGraphDeps,
  DataGraphLoadOptions,
  DataGraphLoadResult,
  DataGraphRouteLoadResult,
  DataSnapshot,
  LoadHookMode,
} from './core/data-graph';
export type { RouterInvalidateOptions } from './core/invalidate-router-cache';

// --- Route hooks (registered via AuraRouter.use) ---

export { resolveHookNames } from './core/hooks/resolve-hook-names';
export { defineRouteHook } from './core/hooks/define-hook';
export type { DefineRouteHookMeta } from './core/hooks/define-hook';
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
  RouteHookFn,
  HookResult,
  HookResultInput,
} from './core/hooks/types';
export type { RouteTransitionType as RouteTransition } from '../aura-route/core/attr/transition-attr-parser';
