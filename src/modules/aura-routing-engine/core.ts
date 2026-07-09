/**
 * Public API of `aura-routing-engine`.
 *
 * Intended consumers: `aura-router`, hook authors, custom `NavigationProvider` / tests.
 * Architecture overview: `core/ARCHITECTURE.md`.
 *
 * **Implementation modules not exported from this barrel:**
 * - `route-tree/` — nested tree, branch diff implementation, `TransitionMap`, `buildTransitionPlan`
 * - `aura-routing-route-registry.ts` — route catalog snapshot
 * - `navigation/` — coordinator, transaction, pipeline, history finalize
 * - `navigation/navigation-finalize.ts` — history policy after terminal outcomes
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
export { resolveEnterBranch, createBranchResolveContext } from './core/view-mount/branch-resolver';
export type {
  BranchContentResolver,
  BranchResolveContext,
  BranchResolveResult,
  BranchResolveTransaction,
} from './core/view-mount/branch-resolver';
export { mountEnterBranch } from './core/view-mount/branch-mount';
export type { MountEnterBranchResult } from './core/view-mount/branch-mount';

export type { TransactionResult, PipelineStepResult, NavigationErrorResult, NavigationShortCircuit } from './core/navigation/types';
export type { NavigationCommittedContext } from './core/navigation/navigation-finalize';

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

// --- Content graph (view payloads: load, prefetch, payload cache) ---

export {
  ContentGraph,
  PayloadCache,
  payloadCacheKey,
  Loader,
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
} from './core/content-graph';

export { TemplateLoader } from './core/content-graph/loaders/template';
export { HtmlLoader } from './core/content-graph/loaders/html';
export { UrlLoader } from './core/content-graph/loaders/url';
export { ComponentLoader } from './core/content-graph/loaders/component';
export { ImportLoader } from './core/content-graph/loaders/import';
export { IframeLoader } from './core/content-graph/loaders/iframe';

export { routeSnapshot, componentMarkup } from './core/content-graph/markup';
export {
  createBrowserEnvironment,
  defaultEnvironment,
  fetchText,
  resolveRelativeUrl,
} from './core/content-graph/environment';

export type {
  ContentGraphDeps,
  ContentPrefetchOptions,
  ContentLoadPort,
  ContentResult,
  RouteContentSource,
  LoaderClass,
  ContentEnvironment,
  ContentDescriptor,
  ContentKind,
  FetchText,
  LoaderFn,
  LoadContext,
  ViewPayload,
} from './core/content-graph';

export type { LoaderType } from '../aura-route/core/attr/view-attr-parser';
export type { RouterInvalidateOptions as ContentInvalidateOptions } from './core/invalidate-router-cache';

export {
  NO_PRESERVE,
  parsePreserveAttr,
} from '../aura-route/core/attr/preserve-attr-parser';
export type { PreserveFlags } from '../aura-route/core/attr/preserve-attr-parser';

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
export type {
  RouterInvalidateOptions,
  RouterInvalidateOptions as RouterDataInvalidateOptions,
} from './core/invalidate-router-cache';

// --- Route hooks (registered via AuraRouter.use) ---

export { resolveHookNames } from './core/hooks/resolve-hook-names';
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
