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
export { RouteViewController } from './core/view/view-controller';
export { createRenderPass, isStale, type RenderPass } from './core/view/render-pass';
export { loadingBodyClass, loadingEvent } from './core/view/plugins';
export { RouteContentLoader } from './core/route-content-loader';
export {
  buildRouteTransition,
  NO_TRANSITION,
  parseTransitionShortcut,
  type RouteTransition,
  type TransitionShortcut,
} from './core/transition/transition';
export {
  ContentResolver,
  type ContentResolverDeps,
  LoaderRegistry,
  defaultLoaderRegistry,
  contentCacheKey,
} from '../aura-routing-engine/core';
export type {
  ContentDescriptor,
  ContentKind,
  LoaderType,
  ResolveContext,
  LoaderFn,
} from '../aura-routing-engine/route-api';
