export { AuraRoute2, type AuraRouteInterface } from './core/aura-route';
export type { RouteRenderOptions, MatchedRouteInfo } from './core/types';
export {
  RouteViewCache,
  defaultViewCache,
  cacheKey,
  destroyViewRoot,
} from './core/view/view-cache';
export type {
  ContentResolverPort,
  ViewCachePort,
  MountTargetPort,
  ViewRenderPlugin,
  RouteViewConfig,
  ViewPayload,
} from './core/view/ports';
export { RouteViewController } from './core/view/view-controller';
export { createRenderPass, isStale, type RenderPass } from './core/view/render-pass';
export { loadingBodyClass, loadingEvent } from './core/view/plugins';
export { RouteContentLoader } from './core/route-content-loader';
export {
  ContentResolver,
  type ContentResolverDeps,
} from './core/loader/content-resolver';
export { ContentCache, defaultContentCache } from './core/loader/content-cache';
export { LoaderRegistry, defaultLoaderRegistry } from './core/loader/registry';
export { contentDescriptor } from './core/loader/descriptor';
export { contentCacheKey } from './core/loader/content-key';
export type {
  ContentDescriptor,
  ContentKind,
  LoaderType,
  ResolveContext,
  LoaderFn,
} from './core/loader/types';
