/**
 * Content layer — route attrs → loader → view payload.
 */

export { ContentLoadService } from './content-load-service';
export type { ContentLoadServiceDeps, ContentPrefetchOptions } from './content-load-service';

export { NO_PRESERVE, parsePreserveAttr } from './model/preserve';
export type { PreserveFlags } from './model/preserve';

export { contentCacheKey } from './cache/content-key';
export { ContentCache } from './cache/content-cache';

export {
  LoaderRegistry,
  createLoaderRegistry,
  defaultLoaderRegistry,
} from './loaders/registry';

export { createBuiltinLoaders } from './loaders/builtins';
export { toLoadContext, routeSnapshot } from './loaders/load-context';

export { fetchText, resolveRelativeUrl } from './transport/http';

export type {
  ContentDescriptor,
  ContentKind,
  FetchText,
  LoaderFn,
  LoaderTransport,
  LoadContext,
  LoaderType,
  ViewPayload,
} from './model/types';
