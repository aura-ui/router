import type { HistoryAction } from '../history/provider.types';
import type { CacheFlags } from '../../../aura-route/core/attr/cache-attr-parser';
import type { MountStrategy } from '../../../aura-route/core/attr/mount-strategy-attr-parser';
import type { RouterPrefetchPolicy } from '../prefetch/prefetch-policy';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import type { ParamChangePolicy } from '../../../aura-route/core/attr/param-change-attr-parser';
import type { ViewAttrDescriptor } from '../../../aura-route/core/attr/view-attr-parser';
import type { RouteRenderOptions, ApplyPreResolvedOptions } from '../../../aura-route/core/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { ViewRenderResult } from '../view-mount/view-commit-render';

export type { RouterPrefetchPolicy };

/** `<aura-route>` getter backing a phase attr (`guard`, `load`, `ready`, …). */
export type RouteHookAttrProp =
  | 'guard'
  | 'load'
  | 'ready'
  | 'leave'
  | 'error'
  | 'transitionIn'
  | 'transitionOut'
  | 'unmount'
  | 'update';

/** All navigation lifecycle phases, including terminal `error`. */
export type RoutePhase =
  | 'leave'
  | 'guard'
  | 'load'
  | 'update'
  | 'transitionOut'
  | 'transitionIn'
  | 'unmount'
  | 'ready'
  | 'error';

/** Pipeline-driven phases (excludes terminal `error`). */
export type LifecyclePhase = Exclude<RoutePhase, 'error'>;

/** Target route slice passed to lifecycle callbacks and hooks. */
export interface RouteInfo {
  pathname: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/** Minimal router surface exposed to hooks (`ctx.router`). */
export interface RouterInstance {
  navigate(path: string, options?: { replace?: boolean; syncHistory?: boolean }): void;
}

/**
 * Route hook name sources — phase attrs on `<aura-route>`.
 *
 * @example
 * ```html
 * <aura-route path="/admin" guard="auth" ready="analytics"></aura-route>
 * ```
 */
export type RouteHookNamesSource = Record<RouteHookAttrProp, string[] | null>;

/**
 * Context for route lifecycle callbacks and registered hooks.
 *
 * `transactionSignal` aborts when the navigation transaction is superseded —
 * long async hooks should check it.
 */
export interface RouteLifecycleContext {
  phase: RoutePhase;
  to: RouteInfo;
  from: RouteInfo | null;
  router: RouterInstance;
  route: RouteInstance;
  action: HistoryAction;
  transactionId: number;
  transactionSignal: AbortSignal;
  /** Load-hook payload from DataGraph when available for this route/phase. */
  data?: unknown;
  /**
   * Opt-in join to the nearest ancestor `load` payload (load phase only).
   * Loads stay parallel until a hook awaits this; then that hook waits for the parent promise.
   */
  parent?: () => Promise<unknown>;
  error?: unknown;
}

/** {@link RouteLifecycleContext} for the terminal `error` phase (`error` is required). */
export type RouteErrorContext = RouteLifecycleContext & {
  error: unknown;
};

/** Route surface used by the routing engine and hook runtime. */
export interface RouteInstance extends RouteHookNamesSource {
  /** Session-scoped instance id (`AuraRoute.uid`) — in-flight maps / equality, not cache keys. */
  readonly uid: number;
  path: string;
  view?: ViewAttrDescriptor | null;
  paramChange?: ParamChangePolicy | null;
  /** From `<aura-route cache="…">` — dom / view-loader / load-hook retention. */
  cache?: CacheFlags;
  /** Inherited from `<aura-route prefetch>` / `<aura-router prefetch>`. */
  readonly prefetch?: RouterPrefetchPolicy | null;
  /** Inherited from `<aura-route mount-strategy>` / `<aura-router mount-strategy>`. */
  readonly mountStrategy?: MountStrategy | null;
  readonly extract?: string | null;
  readonly transition: RouteTransitionType;
  /**
   * Suffix of `viewKey` (`layout:template:…` / `view:…`).
   * Cached on the route; invalidate via attr change / `refresh()`.
   */
  readonly viewKeySuffix: string | null;
  readonly hasGuard: boolean;
  readonly hasUpdate: boolean;
  readonly hasLeave: boolean;
  readonly hasLoad: boolean;
  readonly hasViewContent: boolean;
  readonly hasTransitionIn: boolean;
  readonly hasReady: boolean;
  readonly hasAsyncContent: boolean;
  readonly hasSyncContent: boolean;
  onGuard(ctx: RouteLifecycleContext): void;
  onTransitionIn(ctx: RouteLifecycleContext): void;
  onLoad(ctx: RouteLifecycleContext): void;
  onReady(ctx: RouteLifecycleContext): void;
  onLeave(ctx: RouteLifecycleContext): void;
  onTransitionOut(ctx: RouteLifecycleContext): void;
  onUnmount(ctx: RouteLifecycleContext): void;
  onUpdate(ctx: RouteLifecycleContext): void;
  onError(ctx: RouteErrorContext): void;
  render(
    routeInfo: MatchedRouteInfo,
    options?: RouteRenderOptions,
  ): Promise<ViewRenderResult>;
  /**
   * Sync mount with a pre-resolved payload (branch-atomic apply).
   * Caller must finish branch resolve first; no `await` between parent and child.
   */
  applyPreResolved(
    routeInfo: MatchedRouteInfo,
    options: ApplyPreResolvedOptions,
  ): ViewRenderResult | 'aborted';
  commitStagedView?(): void;
  /** Drops staged views and clears in-flight transition presentation (cancel / supersede). */
  revertInFlightView?(): void;
}
