/**
 * Route-facing API of `aura-routing-engine`.
 *
 * This entrypoint is intentionally lighter than `core.ts`: `<aura-route>` can
 * import parsers and route contracts from here without pulling in the engine
 * orchestrator and creating route-tree cycles.
 */

export { NO_CACHE, parseCacheAttr, type CacheFlags } from '../aura-route/core/attr/cache-attr-parser';
export { resolveHookNames } from './core/hooks/resolve-hook-names';
export {
  parseScrollAttr,
  type ScrollAttr,
} from '../aura-route/core/attr/scroll-attr-parser';
export {
  DEFAULT_ROUTER_PREFETCH_MODE,
  LINK_PREFETCH_MODES,
  parsePrefetchAttr,
  type PrefetchType,
} from '../aura-route/core/attr/prefetch-attr-parser';
export {
  type RouterPrefetchPolicy,
} from './core/prefetch/prefetch-policy';
export { NO_TRANSITION } from '../aura-route/core/attr/transition-attr-parser';

export type { ViewDescriptor, ViewKind, LoaderFn } from './core/view-graph';
export type { LoaderId } from '../aura-route/core/attr/view-attr-parser';
export type { ViewGraph } from './core/view-graph';
export type { MatchedRouteInfo } from './core/match/url-matcher';
export type {
  RouteErrorContext,
  RouteInstance,
  RouteInfo,
  RouteLifecycleContext,
} from './core/route/types';
export type { RouteTransitionType as RouteTransition } from '../aura-route/core/attr/transition-attr-parser';
export type { ViewRenderResult } from './core/view-mount/view-commit-render';
