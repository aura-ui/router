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
export {
  configureRouteContentLoader,
  resolveRouteContentLoaderService,
  RouteContentLoader,
} from './core/route-content-loader';
