/**
 * View graph public API. Built-in loaders and `environment` are internal —
 * import from `aura-routing-engine/core` when needed.
 */
import type { ViewGraph } from './view-graph';

export { ViewGraph, type RouteViewSource, type ViewPrefetchOptions } from './view-graph';
export type { ViewGraphDeps } from './view-graph';

/** Minimal surface for prefetch executor and DI mocks. */
export type ViewLoadPort = Pick<ViewGraph, 'loadView' | 'prefetchBranch'>;

export { PayloadCache } from './cache/payload-cache';
export { payloadCacheKey } from './cache/cache-key';

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
