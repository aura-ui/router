/**
 * View content graph — resolve, prefetch, payload cache (parallel to {@link DataGraph}).
 *
 * Retention model:
 * - `PayloadCache` — string payloads (`url`, `html`, component markup) when `preserve.view`
 * - `ViewCache` (aura-route) — detached DOM keep-alive
 * - `DataGraph` — load-hook data when `preserve.data`
 */

export {
  ContentGraph,
  type RouteContentSource,
} from './content-graph';
export type { ContentGraphDeps } from './content-graph';
export type { ContentPrefetchOptions } from './prefetch';
import type { ContentGraph } from './content-graph';
import type { LoadContext, ViewPayload } from './types';

export {
  PayloadCache,
  payloadCacheKey,
} from './cache';
export type { RouterInvalidateOptions as ContentInvalidateOptions } from '../invalidate-router-cache';

export { routeSnapshot, componentMarkup } from './runtime/markup';

export type LoaderFn = (ctx: LoadContext) => Promise<ViewPayload | null>;

export type {
  ContentDescriptor,
  ContentKind,
  ContentEnvironment,
  ContentResult,
  FetchText,
  LoadContext,
  ViewPayload,
} from './types';

export {
  Loader,
  type LoaderClass,
} from './runtime/loader';

export {
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
} from './runtime/registry';

export {
  BUILTIN_LOADER_CLASSES,
  createDefaultLoaders,
  getBuiltinLoaderTypeIds,
  TemplateLoader,
  HtmlLoader,
  UrlLoader,
  ComponentLoader,
  ImportLoader,
  IframeLoader,
} from './runtime/manifest';

export {
  createBrowserEnvironment,
  defaultEnvironment,
  fetchText,
  resolveRelativeUrl,
} from './runtime/environment';

export {
  BUILTIN_LOADER_TYPES,
  ASYNC_LOADER_TYPES,
  DEFAULT_VIEW_LOADER,
  isAsyncLoader,
  isKnownViewLoader,
} from '../../../aura-route/core/attr/view-attr-parser';

export type { LoaderType } from '../../../aura-route/core/attr/view-attr-parser';

/** Port shared by render and prefetch executors. */
export type ContentResolvePort = Pick<
  ContentGraph,
  'resolve' | 'prefetchBranch'
>;
