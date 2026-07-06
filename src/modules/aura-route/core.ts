export { AuraRoute, type AuraRouteInterface } from './core/aura-route';
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
export { RouteViewController } from './core/view2/view-controller';
export { loadingBodyClass, loadingEvent } from './core/view/plugins';
export {
  LoaderRegistry,
  defaultLoaderRegistry,
  dataCacheKey,
} from '../aura-routing-engine/core';
export type {
  ContentDescriptor,
  ContentKind,
  LoaderType,
  LoaderFn,
} from '../aura-routing-engine/route-api';
