import type { ContentGraph } from './content-graph';

export { ContentGraph, type RouteContentSource, type ContentPrefetchOptions } from './content-graph';
export type { ContentGraphDeps } from './content-graph';

export type ContentLoadPort = Pick<ContentGraph, 'loadView' | 'prefetchBranch'>;

export { PayloadCache } from './cache/payload-cache';
export { payloadCacheKey } from './cache/cache-key';

export { LoaderRegistry, createLoaderRegistry, defaultLoaderRegistry } from './registry';
export { Loader, type LoaderClass } from './loader';

export type {
  LoaderFn,
  ViewPayload,
  LoadContext,
  ContentDescriptor,
  ContentKind,
  ContentResult,
  ContentEnvironment,
  FetchText,
} from './types';
