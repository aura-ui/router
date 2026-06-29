/**
 * Route-facing API of `aura-routing-engine`.
 *
 * This entrypoint is intentionally lighter than `core.ts`: `<aura-route>` can
 * import parsers and route contracts from here without pulling in the engine
 * orchestrator and creating route-tree cycles.
 */

export {
  buildContentDescriptor,
  isLoadableDescriptor,
  parseViewDescriptor,
} from './core/content';
export { NO_PRESERVE, parsePreserveAttr } from './core/content';
export { parsePhaseHooks, resolveHookNames } from './core/lifecycle/bindings/route-hook-bindings';
export {
  DEFAULT_SCROLL_POLICY,
  parseScrollPolicy,
  resolveRouteScrollPolicy,
  resolveScrollPolicy,
  type ScrollPolicy,
  type ScrollPolicySource,
} from './core/navigation/scroll-policy';
export { NO_TRANSITION } from './core/transition/route-transition';
export {
  DEFAULT_TRANSITION_POLICY,
  parseTransitionOrder,
} from './core/transition/policy';

export type {
  ContentDescriptor,
  ContentKind,
  LoaderFn,
  LoaderType,
} from './core/content';
export type { ContentLoadService } from './core/content/content-load-service';
export type { PreserveFlags } from './core/content';
export type { PhaseHooksMap } from './core/lifecycle/types';
export type { MatchedRouteInfo } from './core/match/url-matcher';
export type {
  RouteErrorContext,
  RouteInstance,
  RouteInfo,
  RouteLifecycleContext,
} from './core/route/types';
export type { TransitionPolicy } from './core/transition/policy';
export type { RouteTransition } from './core/transition/route-transition';
export type { ViewRenderResult } from './core/view-mount/view-commit-render';
