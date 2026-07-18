/**
 * View graph public API. Built-in loaders and `environment` are internal —
 * import from `aura-routing-engine/core` when needed.
 */
import type { ViewGraph } from './view-graph';

export {
  ViewGraph,
  type ViewPrefetchOptions,
  type ViewGraphCacheOptions,
  type ViewLoadOptions,
  type ViewGraphLoadResult,
  type RouteViewSource,
} from './view-graph';
export type { ViewGraphDeps } from './view-graph';

/** Minimal surface for prefetch executor and DI mocks. */
export type ViewLoadPort = Pick<ViewGraph, 'loadView' | 'prefetchBranch'>;

/** Async layout / view loader — same contract as aura-route `ViewResolverPort`. */
export type ViewResolverPort = Pick<ViewGraph, 'loadView'>;

/** Branch-atomic resolve: parallel `loadView` without mounting. */
export type BranchViewResolver = ViewResolverPort;

export { ViewPayloadCache } from './cache/view-payload-cache';

export { LoaderRegistry, createLoaderRegistry, defaultLoaderRegistry } from './registry';
export { Loader, type LoaderClass } from './loader';

export type {
  LoaderFn,
  ViewPayload,
  ViewLoadContext,
  ViewDescriptor,
  ViewKind,
  ViewLoadResult,
  ViewLoaderEnv,
  FetchText,
} from './types';
