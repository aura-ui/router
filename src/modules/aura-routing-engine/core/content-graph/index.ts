export {
  ContentGraph,
  type RouteContentSource,
  type ContentPrefetchOptions,
} from './content-graph';
export type { ContentGraphDeps } from './content-graph';
import type { ContentGraph } from './content-graph';

export { PayloadCache, payloadCacheKey } from './cache';
export type { RouterInvalidateOptions as ContentInvalidateOptions } from '../invalidate-router-cache';

export { routeSnapshot, componentMarkup } from './markup';

export type { LoaderFn } from './types';
export type {
  ContentDescriptor,
  ContentKind,
  ContentEnvironment,
  ContentResult,
  FetchText,
  LoadContext,
  ViewPayload,
} from './types';

export { Loader, type LoaderClass } from './loader';

export {
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
} from './registry';

export { TemplateLoader } from './loaders/template';
export { HtmlLoader } from './loaders/html';
export { UrlLoader } from './loaders/url';
export { ComponentLoader } from './loaders/component';
export { ImportLoader } from './loaders/import';
export { IframeLoader } from './loaders/iframe';

export {
  createBrowserEnvironment,
  defaultEnvironment,
  fetchText,
  resolveRelativeUrl,
} from './environment';

export {
  BUILTIN_LOADER_TYPES,
  ASYNC_LOADER_TYPES,
  DEFAULT_VIEW_LOADER,
  isAsyncLoader,
  isKnownViewLoader,
} from '../../../aura-route/core/attr/view-attr-parser';

export type { LoaderType } from '../../../aura-route/core/attr/view-attr-parser';

export type ContentLoadPort = Pick<ContentGraph, 'loadView' | 'prefetchBranch'>;
