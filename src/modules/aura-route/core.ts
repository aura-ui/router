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
export {
  LoaderRegistry,
  defaultLoaderRegistry,
  viewKey,
  viewKeyWithData,
} from '../aura-routing-engine/core';
export type {
  ViewDescriptor,
  ViewKind,
  LoaderId,
  LoaderFn,
} from '../aura-routing-engine/route-api';
export {
  AuraRoute,
  AURA_ROUTE_LOADING_END,
  AURA_ROUTE_LOADING_START,
  type AuraRouteInterface,
  type RouteType,
} from './core/aura-route';
export type { RouteRenderOptions, ApplyPreResolvedOptions, MatchedRouteInfo } from './core/types';
