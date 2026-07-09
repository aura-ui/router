export {
  RouteDomCache,
  defaultDomCache,
  domCacheKey,
  destroyViewRoot,
} from './core/view/dom-cache';
export type {
  ViewResolverPort,
  DomCachePort,
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
  viewCacheKey,
} from '../aura-routing-engine/core';
export type {
  ViewDescriptor,
  ViewKind,
  LoaderId,
  LoaderFn,
} from '../aura-routing-engine/route-api';
export { AuraRoute, type AuraRouteInterface } from './core/aura-route';
export type { RouteRenderOptions, ApplyPreResolvedOptions, MatchedRouteInfo } from './core/types';
