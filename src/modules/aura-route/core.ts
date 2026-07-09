export { AuraRoute, type AuraRouteInterface } from './core/aura-route';
export type { RouteRenderOptions, ApplyPreResolvedOptions, MatchedRouteInfo } from './core/types';
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
  RenderPass,
} from './core/view/types';
export { RouteViewController } from './core/view/view-controller';
export { loadingBodyClass, loadingEvent } from './core/plugins/view-loading-plugins';
export {
  LoaderRegistry,
  defaultLoaderRegistry,
  payloadCacheKey,
} from '../aura-routing-engine/core';
export type {
  ContentDescriptor,
  ContentKind,
  LoaderType,
  LoaderFn,
} from '../aura-routing-engine/route-api';
