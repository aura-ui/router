/**
 * Route-facing API of `aura-routing-engine`.
 *
 * This entrypoint is intentionally lighter than `core.ts`: `<aura-route>` can
 * import parsers and route contracts from here without pulling in the engine
 * orchestrator and creating route-tree cycles.
 */

export {
  buildContentDescriptor,
  parseViewDescriptor,
} from './core/content/descriptor';
export { NO_PRESERVE, parsePreserveAttr } from './core/content/preserve';
export { parsePhaseHooks, resolveHookNames } from './core/lifecycle/phase-attrs';
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
  ResolveContext,
} from './core/content/types';
export type { ContentLoadService } from './core/content/content-load-service';
export type { PreserveFlags } from './core/content/preserve';
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
export type { ViewRenderResult } from './core/view-mount/view-render';
