/**
 * View graph public API. Built-in loaders and `environment` are internal —
 * import from `aura-routing-engine/core` when needed.
 */
import type { ViewGraph } from './view-graph';

export {
  ViewGraph,
  type ViewGraphCacheOptions,
  type ViewGraphDeps,
  type ViewDataInput,
  type ViewLoadOptions,
  type ViewGraphLoadResult,
  type ViewGraphLoadViewsResult,
  type ViewPrefetchOptions,
  type RouteViewSource,
} from './view-graph';

/** Minimal surface for prepare / prefetch executor and DI mocks. */
export type ViewLoadPort = Pick<ViewGraph, 'load' | 'loadView'>;

/** Async layout / view loader — same contract as aura-route `ViewResolverPort`. */
export type ViewResolverPort = Pick<ViewGraph, 'loadView'>;

export {
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
  type RegisterLoaderOptions,
} from './registry';
export { Loader, type LoaderClass } from './loader';

export type {
  LoaderFn,
  ViewPayload,
  ViewLoadContext,
  ViewLoadResult,
  ViewDescriptor,
  ViewKind,
  ViewLoaderEnv,
  FetchText,
} from './types';
