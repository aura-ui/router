/**
 * Public entry for `@auraui/router`.
 *
 * Consumers:
 * ```ts
 * import { AuraRouter, defineRouteHook } from '@auraui/router';
 * AuraRouter.install();
 * ```
 */

export {
  AuraRouter,
  type AuraRouterConfigureOptions,
  type RouterInstance,
  type ActiveRouteBranchEntry,
  AURA_ROUTER_NOT_FOUND,
  AURA_ROUTER_NAVIGATION_ERROR,
  AURA_ROUTER_NAVIGATION_HOOK_ERROR,
  AURA_ROUTER_NAVIGATION,
  AURA_ROUTER_NAVIGATION_START,
  AURA_ROUTER_NAVIGATION_COMPLETE,
  AURA_ROUTER_NAVIGATION_CANCEL,
  AURA_ROUTER_NAVIGATION_REDIRECT,
  AURA_ROUTER_LOAD_START,
  AURA_ROUTER_LOAD_END,
  AURA_ROUTER_LOAD_ERROR,
  AURA_ROUTER_DATA_INVALIDATED,
  type NotFoundHandler,
  type NotFoundSource,
  type AuraRouterNotFoundEventDetail,
  type AuraRouterNotFoundEvent,
  type AuraRouterNavigationErrorEventDetail,
  type AuraRouterNavigationErrorEvent,
  type AuraRouterNavigationHookErrorEventDetail,
  type AuraRouterNavigationHookErrorEvent,
  type AuraRouterNavigationEventDetail,
  type AuraRouterNavigationEvent,
  type AuraRouterNavigationStartEvent,
  type AuraRouterNavigationCompleteEventDetail,
  type AuraRouterNavigationCompleteEvent,
  type AuraRouterNavigationCancelEventDetail,
  type AuraRouterNavigationCancelEvent,
  type AuraRouterNavigationRedirectEventDetail,
  type AuraRouterNavigationRedirectEvent,
  type AuraRouterLoadEventDetail,
  type AuraRouterLoadStartEvent,
  type AuraRouterLoadEndEvent,
  type AuraRouterLoadErrorEventDetail,
  type AuraRouterLoadErrorEvent,
  type AuraRouterDataInvalidatedEventDetail,
  type AuraRouterDataInvalidatedEvent,
} from './modules/aura-router/core';

export { AuraRoute } from './modules/aura-route/core/aura-route';
export { AuraOutlet } from './modules/aura-outlet/core/aura-outlet';

export { defineRouteHook } from './modules/aura-routing-engine/core';
export type {
  LoaderFn,
  RouteHookDefinition,
  NavigationErrorPhase,
  NavigationFailureCode,
} from './modules/aura-routing-engine/core';
